/**
 * Storyboard Viewer API Server
 * Serves the HTML UI and provides REST endpoints for SQLite cache access
 *  bun html/server.ts
 */

import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Configuration
const PORT = 3000;
const PROJECT_ROOT = process.cwd();
const CACHE_DB_PATH = join(PROJECT_ROOT, 'tmp', 'cache.sqlite');
const IMAGES_DIR = join(PROJECT_ROOT, 'tmp', 'images');
const HTML_DIR = join(PROJECT_ROOT, 'html');

// Database connection
let db: Database | null = null;

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
    id: number;
    audio_hash: string;
    audio_filename: string;
    audio_path: string | null;
    transcript_words: string | null;
    audio_duration: number | null;
    created_at: number;
    updated_at: number;
}

interface StyleCacheRow {
    id: number;
    audio_hash: string;
    style_id: string;
    orientation: string;
    natural_edit: number;
    segments: string | null;
    formatted_transcript: string | null;
    story_context: string | null;
    image_queries: string | null;
    downloaded_images: string | null;
    created_at: number;
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

    // Get all style entries
    const styleRows = database.prepare('SELECT * FROM style_cache').all() as StyleCacheRow[];

    // Group styles by audio_hash
    const stylesByHash = new Map<string, StyleCacheRow[]>();
    for (const style of styleRows) {
        const existing = stylesByHash.get(style.audio_hash) || [];
        existing.push(style);
        stylesByHash.set(style.audio_hash, existing);
    }

    // Build project list
    const projects: Project[] = [];
    for (const audio of audioRows) {
        const styles = stylesByHash.get(audio.audio_hash) || [];

        projects.push({
            audioHash: audio.audio_hash,
            filename: audio.audio_filename,
            duration: audio.audio_duration,
            createdAt: audio.created_at,
            styles: styles.map(s => {
                let segmentCount = 0;
                if (s.segments) {
                    try {
                        const parsed = JSON.parse(s.segments);
                        segmentCount = Array.isArray(parsed) ? parsed.length : 0;
                    } catch { /* ignore */ }
                }

                return {
                    styleId: s.style_id,
                    orientation: s.orientation,
                    naturalEdit: s.natural_edit === 1,
                    hasSegments: !!s.segments,
                    hasQueries: !!s.image_queries,
                    hasImages: !!s.downloaded_images,
                    segmentCount,
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

function getStoryboard(audioHash: string, styleId: string, orientation: string = 'horizontal'): StoryboardResponse | null {
    const database = getDb();

    // Get audio info
    const audio = database.prepare('SELECT * FROM audio_cache WHERE audio_hash = ?').get(audioHash) as AudioCacheRow | null;
    if (!audio) return null;

    // Get style cache
    const style = database.prepare(
        'SELECT * FROM style_cache WHERE audio_hash = ? AND style_id = ? AND orientation = ?'
    ).get(audioHash, styleId, orientation) as StyleCacheRow | null;

    if (!style) return null;

    // Parse data
    let segments: Array<{ index: number; text: string; start: number; end: number }> = [];
    let queries: Array<{ query: string; start: number; end: number; type?: string; linkedTo?: number | null }> = [];
    let images: Array<{ filePath: string; query: string; start: number; end: number }> = [];

    if (style.segments) {
        try { segments = JSON.parse(style.segments); } catch { /* ignore */ }
    }
    if (style.image_queries) {
        try { queries = JSON.parse(style.image_queries); } catch { /* ignore */ }
    }
    if (style.downloaded_images) {
        try { images = JSON.parse(style.downloaded_images); } catch { /* ignore */ }
    }

    // Build entries by matching on index/timing
    const entries: StoryboardEntry[] = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (!segment) continue;

        // Find matching query (by index or timing)
        const query = queries[i] || null;

        // Find matching image
        const image = images[i] || null;

        entries.push({
            index: i,
            segment: {
                text: segment.text,
                start: segment.start,
                end: segment.end,
            },
            query: query ? {
                query: query.query,
                start: query.start,
                end: query.end,
                type: query.type,
                linkedTo: query.linkedTo,
            } : null,
            image: image ? {
                filePath: image.filePath,
                exists: existsSync(image.filePath),
                url: `/images/${encodeURIComponent(image.filePath)}`,
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

function updateQuery(audioHash: string, styleId: string, orientation: string, index: number, newQuery: string, newType?: string): boolean {
    const database = getDb();

    // Get current style cache
    const style = database.prepare(
        'SELECT image_queries FROM style_cache WHERE audio_hash = ? AND style_id = ? AND orientation = ?'
    ).get(audioHash, styleId, orientation) as { image_queries: string | null } | null;

    if (!style?.image_queries) return false;

    try {
        const queries = JSON.parse(style.image_queries) as Array<{ query: string; type?: string;[key: string]: unknown }>;

        if (index < 0 || index >= queries.length) return false;

        // Update the query and type
        const q = queries[index];
        if (q) {
            q.query = newQuery;
            if (newType) {
                q.type = newType;
            }
        }

        // Save back to database
        const stmt = database.prepare(
            'UPDATE style_cache SET image_queries = ?, updated_at = strftime(\'%s\', \'now\') WHERE audio_hash = ? AND style_id = ? AND orientation = ?'
        );
        stmt.run(JSON.stringify(queries), audioHash, styleId, orientation);

        return true;
    } catch {
        return false;
    }
}

function deleteImages(audioHash: string, styleId: string, orientation: string): boolean {
    const database = getDb();

    try {
        const stmt = database.prepare(
            'UPDATE style_cache SET downloaded_images = NULL, updated_at = strftime(\'%s\', \'now\') WHERE audio_hash = ? AND style_id = ? AND orientation = ?'
        );
        stmt.run(audioHash, styleId, orientation);
        return true;
    } catch {
        return false;
    }
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

            if (!audioHash || !styleId) {
                return Response.json({ error: 'Missing audioHash or styleId' }, { status: 400, headers: corsHeaders });
            }

            const storyboard = getStoryboard(audioHash, styleId, orientation);
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

            if (!audioHash || !styleId || isNaN(index)) {
                return Response.json({ error: 'Invalid parameters' }, { status: 400, headers: corsHeaders });
            }

            const body = await req.json() as { query?: string; type?: string };
            if (!body.query) {
                return Response.json({ error: 'Missing query in body' }, { status: 400, headers: corsHeaders });
            }

            const success = updateQuery(audioHash, styleId, orientation, index, body.query, body.type);
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

            if (!audioHash || !styleId) {
                return Response.json({ error: 'Invalid parameters' }, { status: 400, headers: corsHeaders });
            }

            const success = deleteImages(audioHash, styleId, orientation);
            return Response.json({ success }, { headers: corsHeaders });
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
});

console.log(`✓ Server running at http://localhost:${server.port}`);
console.log('');
console.log('Press Ctrl+C to stop');
