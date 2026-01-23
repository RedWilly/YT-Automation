/**
 * Storyboard Viewer API Server
 * Serves the HTML UI and provides REST endpoints for SQLite cache access
 *  bun html/server.ts
 */

import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from 'dotenv';

// Load environment variables for API providers
config();

// Direct imports from src for image generation
import { getProvider, generateWithSafetyRetry } from '../src/services/image/providers/index.ts';
import { getStyle, resolveStyle } from '../src/styles/index.ts';

// Configuration
const PORT = 3000;
const PROJECT_ROOT = process.cwd();
const CACHE_DB_PATH = join(PROJECT_ROOT, 'tmp', 'cache.sqlite');
const IMAGES_DIR = join(PROJECT_ROOT, 'tmp', 'images');
const HTML_DIR = join(PROJECT_ROOT, 'html');

// Database connection
let db: Database | null = null;

// Track in-flight regeneration requests to prevent duplicates
const pendingRegenerations = new Map<string, Promise<string>>();

function getDb(): Database {
    if (!db) {
        if (!existsSync(CACHE_DB_PATH)) {
            throw new Error(`Database not found at ${CACHE_DB_PATH}`);
        }
        db = new Database(CACHE_DB_PATH);
    }
    return db;
}

// Types
interface AudioCacheRow {
    audio_hash: string;
    audio_filename: string;
    audio_path: string | null;
    upload_url: string | null;
    transcript_id: string | null;
    transcript_words: string | null;
    audio_duration: number | null;
    updated_at: number;
}

interface JobCacheRow {
    audio_hash: string;
    style_id: string;
    orientation: string;
    natural_edit: number;
    segments: string | null;
    formatted_transcript: string | null;
    story_context: string | null;
    updated_at: number;
}

interface SegmentCacheRow {
    audio_hash: string;
    style_id: string;
    orientation: string;
    natural_edit: number;
    segment_index: number;
    total_segments: number;
    original_prompt: string;
    current_prompt: string;
    structured_shot: string;
    rewrite_count: number;
    status: 'pending' | 'approved' | 'failed';
    seed: number | null;
    image_path: string | null;
    updated_at: number;
}

interface Project {
    audioHash: string;
    filename: string;
    duration: number | null;
    createdAt: number;
    styles: Array<{
        styleId: string;
        orientation: string;
        naturalEdit: boolean;
        hasSegments: boolean;
        hasQueries: boolean;
        hasImages: boolean;
        segmentCount: number;
    }>;
}

// API Handlers
function getProjects(): Project[] {
    const database = getDb();

    // Get all audio entries
    const audioRows = database.prepare('SELECT * FROM audio_cache ORDER BY updated_at DESC').all() as AudioCacheRow[];

    // Get all job entries
    const jobRows = database.prepare('SELECT * FROM job_cache').all() as JobCacheRow[];

    // Get segment counts and status from segment_cache
    const segmentStatsRows = database.prepare(`
        SELECT 
            audio_hash, style_id, orientation, natural_edit,
            COUNT(*) as segment_count,
            SUM(CASE WHEN image_path IS NOT NULL THEN 1 ELSE 0 END) as image_count
        FROM segment_cache
        GROUP BY audio_hash, style_id, orientation, natural_edit
    `).all() as Array<{
        audio_hash: string;
        style_id: string;
        orientation: string;
        natural_edit: number;
        segment_count: number;
        image_count: number;
    }>;

    // Build stats lookup (normalize style_id to lowercase for consistent matching)
    const statsLookup = new Map<string, typeof segmentStatsRows[0]>();
    for (const stat of segmentStatsRows) {
        const key = `${stat.audio_hash}:${stat.style_id.toLowerCase()}:${stat.orientation}:${stat.natural_edit}`;
        statsLookup.set(key, stat);
    }

    // Group jobs by audio_hash and deduplicate case-insensitive styles
    const jobsByHash = new Map<string, JobCacheRow[]>();
    for (const job of jobRows) {
        const existing = jobsByHash.get(job.audio_hash) || [];
        // Case-insensitive check for duplicate style/orientation combos
        const isDuplicate = existing.some(e =>
            e.style_id.toLowerCase() === job.style_id.toLowerCase() &&
            e.orientation === job.orientation &&
            e.natural_edit === job.natural_edit
        );
        if (!isDuplicate) {
            existing.push(job);
            jobsByHash.set(job.audio_hash, existing);
        }
    }

    // Build project list
    const projects: Project[] = [];
    for (const audio of audioRows) {
        const jobs = jobsByHash.get(audio.audio_hash) || [];

        projects.push({
            audioHash: audio.audio_hash,
            filename: audio.audio_filename,
            duration: audio.audio_duration,
            createdAt: audio.updated_at, // audio_cache uses updated_at
            styles: jobs.map(j => {
                const statKey = `${j.audio_hash}:${j.style_id.toLowerCase()}:${j.orientation}:${j.natural_edit}`;
                const stats = statsLookup.get(statKey);

                return {
                    styleId: j.style_id,
                    orientation: j.orientation,
                    naturalEdit: j.natural_edit === 1,
                    hasSegments: !!j.segments,
                    hasQueries: (stats?.segment_count ?? 0) > 0,
                    hasImages: (stats?.image_count ?? 0) > 0,
                    segmentCount: stats?.segment_count ?? 0,
                };
            }),
        });
    }

    return projects;
}

interface StoryboardEntry {
    index: number;
    segment: {
        text: string;
        start: number;
        end: number;
    };
    query: {
        query: string;
        start: number;
        end: number;
        type?: string;
        linkedTo?: number | null;
    } | null;
    image: {
        filePath: string;
        exists: boolean;
        url: string;
    } | null;
}

interface StoryboardResponse {
    audioHash: string;
    styleId: string;
    orientation: string;
    filename: string;
    duration: number | null;
    entries: StoryboardEntry[];
}

function getStoryboard(audioHash: string, styleId: string, orientation: string = 'horizontal', naturalEdit: boolean = false): StoryboardResponse | null {
    const database = getDb();
    const ne = naturalEdit ? 1 : 0;

    // Get audio info
    const audio = database.prepare('SELECT * FROM audio_cache WHERE audio_hash = ?').get(audioHash) as AudioCacheRow | null;
    if (!audio) return null;

    // Get job cache (case-insensitive style_id)
    const job = database.prepare(
        'SELECT * FROM job_cache WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ?'
    ).get(audioHash, styleId, orientation, ne) as JobCacheRow | null;

    if (!job) return null;

    // Get segment cache entries (case-insensitive style_id)
    const segmentRows = database.prepare(
        'SELECT * FROM segment_cache WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ? ORDER BY segment_index ASC'
    ).all(audioHash, styleId, orientation, ne) as SegmentCacheRow[];

    // Parse TranscriptSegments from job
    let transcriptSegments: Array<{ text: string; start: number; end: number }> = [];
    if (job.segments) {
        try { transcriptSegments = JSON.parse(job.segments); } catch { /* ignore */ }
    }

    // Build entries by matching transcript segments with segment cache
    const entries: StoryboardEntry[] = [];

    // Pre-index segment cache rows by segment_index for O(1) lookup.
    // Note: segment_cache uses 1-based indexing for segment_index.
    const segmentCacheByIndex = new Map<number, SegmentCacheRow>();
    for (const row of segmentRows) {
        segmentCacheByIndex.set(row.segment_index, row);
    }

    for (let i = 0; i < transcriptSegments.length; i++) {
        const transcriptSegment = transcriptSegments[i];
        if (!transcriptSegment) continue;

        const segmentIndex = i + 1;
        const cacheRow = segmentCacheByIndex.get(segmentIndex) ?? null;

        let queryData: any | null = null;
        if (cacheRow) {
            try {
                const shot = JSON.parse(cacheRow.structured_shot);
                queryData = {
                    query: cacheRow.current_prompt,
                    start: shot.start,
                    end: shot.end,
                    type: shot.type,
                };
            } catch { /* ignore */ }
        }

        entries.push({
            index: i,
            segment: {
                text: transcriptSegment.text,
                start: transcriptSegment.start,
                end: transcriptSegment.end,
            },
            query: queryData,
            image: cacheRow?.image_path ? {
                filePath: cacheRow.image_path,
                exists: existsSync(cacheRow.image_path),
                url: `/images/${encodeURIComponent(cacheRow.image_path)}`,
            } : null,
        });
    }

    return {
        audioHash,
        styleId,
        orientation,
        filename: audio.audio_filename,
        duration: audio.audio_duration,
        entries,
    };
}

function updateQuery(audioHash: string, styleId: string, orientation: string, index: number, newQuery: string, newType?: string, naturalEdit: boolean = false): boolean {
    const database = getDb();
    const ne = naturalEdit ? 1 : 0;
    const segmentIndex = index + 1; // 1-based

    try {
        // Get current segment cache (case-insensitive style_id)
        const cacheRow = database.prepare(
            'SELECT structured_shot FROM segment_cache WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ? AND segment_index = ?'
        ).get(audioHash, styleId, orientation, ne, segmentIndex) as { structured_shot: string } | null;

        if (!cacheRow) return false;

        const shot = JSON.parse(cacheRow.structured_shot);
        if (newType) {
            shot.type = newType;
        }

        // Save back to database (case-insensitive style_id)
        const stmt = database.prepare(`
            UPDATE segment_cache 
            SET current_prompt = ?, structured_shot = ?, updated_at = strftime('%s', 'now') 
            WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ? AND segment_index = ?
        `);
        stmt.run(newQuery, JSON.stringify(shot), audioHash, styleId, orientation, ne, segmentIndex);

        return true;
    } catch (e) {
        console.error('Failed to update query', e);
        return false;
    }
}

function deleteImages(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean = false): boolean {
    const database = getDb();
    const ne = naturalEdit ? 1 : 0;

    try {
        const stmt = database.prepare(`
            UPDATE segment_cache 
            SET image_path = NULL, status = 'pending', updated_at = strftime('%s', 'now') 
            WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ?
        `);
        stmt.run(audioHash, styleId, orientation, ne);
        return true;
    } catch (e) {
        console.error('Failed to delete images', e);
        return false;
    }
}

async function regenerateSegmentImage(audioHash: string, styleId: string, orientation: string, index: number, naturalEdit: boolean = false): Promise<string> {
    // Deduplicate: if same segment is already being regenerated, wait for that instead
    // NOTE: styleId is normalized to lowercase to match DB lookup semantics (LOWER(style_id) = LOWER(?))
    const normalizedStyleId = styleId.toLowerCase();
    const dedupeKey = `${audioHash}:${normalizedStyleId}:${orientation}:${index}:${naturalEdit}`;
    const pending = pendingRegenerations.get(dedupeKey);
    if (pending) {
        console.log(`[Regeneration] Request already in progress for segment ${index}, waiting...`);
        return pending;
    }

    const regenerationPromise = doRegenerateSegmentImage(audioHash, styleId, orientation, index, naturalEdit);
    pendingRegenerations.set(dedupeKey, regenerationPromise);

    try {
        return await regenerationPromise;
    } finally {
        pendingRegenerations.delete(dedupeKey);
    }
}

async function doRegenerateSegmentImage(audioHash: string, styleId: string, orientation: string, index: number, naturalEdit: boolean = false): Promise<string> {
    const database = getDb();
    const ne = naturalEdit ? 1 : 0;
    const segmentIndex = index + 1; // 1-based

    // 1. Get segment data
    const cacheRow = database.prepare(
        'SELECT current_prompt, structured_shot, seed FROM segment_cache WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ? AND segment_index = ?'
    ).get(audioHash, styleId, orientation, ne, segmentIndex) as { current_prompt: string, structured_shot: string, seed: number | null } | null;

    if (!cacheRow) throw new Error("Segment not found in database");

    // 2. Resolve style
    const style = getStyle(styleId) || getStyle("history")!;
    const resolvedStyle = resolveStyle(style, { orientation: orientation as any });

    // 3. Setup provider
    const provider = getProvider();
    const aspectRatio: '16:9' | '9:16' = orientation === 'vertical' ? '9:16' : '16:9';

    // Use existing seed if available, otherwise random
    const seed = cacheRow.seed || (Math.floor(Math.random() * 2147483646) + 1);

    // 4. Generate with unified safety retry (handles UnsafePromptError automatically)
    // Pass raw prompt - style is applied at generation time via stylePrefix
    console.log(`[Regeneration] Generating image for segment ${index} (seed: ${seed}) with prompt: ${cacheRow.current_prompt.substring(0, 100)}...`);
    const result = await generateWithSafetyRetry(
        provider,
        {
            prompt: cacheRow.current_prompt,
            negativePrompt: resolvedStyle.negativePrompt,
            aspectRatio,
            seed,
        },
        {
            style: resolvedStyle,
            stylePrefix: resolvedStyle.imageStyle,
            onPromptRewritten: (newPrompt, rewriteCount) => {
                // Update the prompt in DB when rewritten (raw scene, no style)
                database.prepare(`
                    UPDATE segment_cache 
                    SET current_prompt = ?, rewrite_count = ?, updated_at = strftime('%s', 'now') 
                    WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ? AND segment_index = ?
                `).run(newPrompt, rewriteCount, audioHash, styleId, orientation, ne, segmentIndex);
                console.log(`[Regeneration] Prompt rewritten (${rewriteCount}x): ${newPrompt.substring(0, 60)}...`);
            },
        }
    );

    // 5. Save
    const orientationSuffix = orientation === 'vertical' ? '_vertical' : '';
    const filename = `${resolvedStyle.id}${orientationSuffix}_${index}.${result.format}`;
    const filePath = join(IMAGES_DIR, filename);

    if (!existsSync(IMAGES_DIR)) {
        await Bun.spawn(["mkdir", "-p", IMAGES_DIR]).exited;
    }

    await Bun.write(filePath, result.data);
    console.log(`[Regeneration] Saved image to: ${filePath}`);

    // 6. Update DB (also persist the chosen seed for deterministic regeneration)
    database.prepare(`
        UPDATE segment_cache 
        SET image_path = ?, status = 'approved', seed = ?, updated_at = strftime('%s', 'now') 
        WHERE audio_hash = ? AND LOWER(style_id) = LOWER(?) AND orientation = ? AND natural_edit = ? AND segment_index = ?
    `).run(filePath, seed, audioHash, styleId, orientation, ne, segmentIndex);

    return filePath;
}

// Static file serving
function getContentType(path: string): string {
    if (path.endsWith('.html')) return 'text/html; charset=utf-8';
    if (path.endsWith('.css')) return 'text/css; charset=utf-8';
    if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
    if (path.endsWith('.json')) return 'application/json';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif')) return 'image/gif';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
}

async function serveFile(filePath: string): Promise<Response> {
    try {
        const file = Bun.file(filePath);
        if (await file.exists()) {
            return new Response(file, {
                headers: { 'Content-Type': getContentType(filePath) },
            });
        }
    } catch { /* ignore */ }

    return new Response('Not Found', { status: 404 });
}

// Request handler
async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS headers for local development
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // API Routes
        if (path === '/api/projects' && method === 'GET') {
            const projects = getProjects();
            return Response.json(projects, { headers: corsHeaders });
        }

        if (path.startsWith('/api/storyboard/') && method === 'GET') {
            const parts = path.replace('/api/storyboard/', '').split('/');
            const audioHash = parts[0];
            const styleId = parts[1];
            const orientation = url.searchParams.get('orientation') || 'horizontal';
            const naturalEdit = url.searchParams.get('naturalEdit') === 'true';

            if (!audioHash || !styleId) {
                return Response.json({ error: 'Missing audioHash or styleId' }, { status: 400, headers: corsHeaders });
            }

            const storyboard = getStoryboard(audioHash, styleId, orientation, naturalEdit);
            if (!storyboard) {
                return Response.json({ error: 'Storyboard not found' }, { status: 404, headers: corsHeaders });
            }

            return Response.json(storyboard, { headers: corsHeaders });
        }

        if (path.startsWith('/api/query/') && method === 'PUT') {
            const parts = path.replace('/api/query/', '').split('/');
            const audioHash = parts[0];
            const styleId = parts[1];
            const index = parseInt(parts[2] || '', 10);
            const orientation = url.searchParams.get('orientation') || 'horizontal';
            const naturalEdit = url.searchParams.get('naturalEdit') === 'true';

            if (!audioHash || !styleId || isNaN(index)) {
                return Response.json({ error: 'Invalid parameters' }, { status: 400, headers: corsHeaders });
            }

            const body = await req.json() as { query?: string; type?: string };
            if (!body.query) {
                return Response.json({ error: 'Missing query in body' }, { status: 400, headers: corsHeaders });
            }

            const success = updateQuery(audioHash, styleId, orientation, index, body.query, body.type, naturalEdit);
            if (!success) {
                return Response.json({ error: 'Failed to update query' }, { status: 500, headers: corsHeaders });
            }

            return Response.json({ success: true }, { headers: corsHeaders });
        }

        if (path.startsWith('/api/images/') && method === 'DELETE') {
            const parts = path.replace('/api/images/', '').split('/');
            const audioHash = parts[0];
            const styleId = parts[1];
            const orientation = url.searchParams.get('orientation') || 'horizontal';
            const naturalEdit = url.searchParams.get('naturalEdit') === 'true';

            if (!audioHash || !styleId) {
                return Response.json({ error: 'Invalid parameters' }, { status: 400, headers: corsHeaders });
            }

            const success = deleteImages(audioHash, styleId, orientation, naturalEdit);
            return Response.json({ success }, { headers: corsHeaders });
        }

        if (path.startsWith('/api/regenerate/') && method === 'POST') {
            const parts = path.replace('/api/regenerate/', '').split('/');
            const audioHash = parts[0];
            const styleId = parts[1];
            const index = parseInt(parts[2] || '', 10);
            const orientation = url.searchParams.get('orientation') || 'horizontal';
            const naturalEdit = url.searchParams.get('naturalEdit') === 'true';

            if (!audioHash || !styleId || isNaN(index)) {
                return Response.json({ error: 'Invalid parameters' }, { status: 400, headers: corsHeaders });
            }

            const filePath = await regenerateSegmentImage(audioHash, styleId, orientation, index, naturalEdit);
            return Response.json({
                success: true,
                filePath,
                url: `/images/${encodeURIComponent(filePath)}?t=${Date.now()}` // Add timestamp to bust cache
            }, { headers: corsHeaders });
        }

        // Serve images from tmp/images directory or by full path
        if (path.startsWith('/images/')) {
            const imagePath = decodeURIComponent(path.replace('/images/', ''));

            // First try: direct path (if stored as full path in DB)
            if (existsSync(imagePath)) {
                return serveFile(imagePath);
            }

            // Second try: in images directory by filename
            const fullPath = join(IMAGES_DIR, imagePath);
            if (existsSync(fullPath)) {
                return serveFile(fullPath);
            }

            // Third try: search by partial match
            if (existsSync(IMAGES_DIR)) {
                const files = readdirSync(IMAGES_DIR);
                for (const file of files) {
                    if (file === imagePath || file.includes(imagePath)) {
                        return serveFile(join(IMAGES_DIR, file));
                    }
                }
            }

            return new Response('Image not found', { status: 404, headers: corsHeaders });
        }

        // Static files
        if (path === '/' || path === '/index.html') {
            return serveFile(join(HTML_DIR, 'index.html'));
        }
        if (path === '/styles.css') {
            return serveFile(join(HTML_DIR, 'styles.css'));
        }
        if (path === '/app.js') {
            return serveFile(join(HTML_DIR, 'app.js'));
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error) {
        console.error('Server error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// Start server
console.log('='.repeat(50));
console.log('Storyboard Viewer Server');
console.log('='.repeat(50));
console.log(`Database: ${CACHE_DB_PATH}`);
console.log(`Images: ${IMAGES_DIR}`);
console.log(`HTML: ${HTML_DIR}`);
console.log('');

if (!existsSync(CACHE_DB_PATH)) {
    console.error(`❌ Database not found at ${CACHE_DB_PATH}`);
    console.log('Run the v2v bot first to generate some projects.');
    process.exit(1);
}

const server = Bun.serve({
    port: PORT,
    fetch: handleRequest,
    idleTimeout: 120, // 2 minutes - LLM rewrite + image generation can be slow
});

console.log(`✓ Server running at http://localhost:${server.port}`);
console.log('');
console.log('Press Ctrl+C to stop');
