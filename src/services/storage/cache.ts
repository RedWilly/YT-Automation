/**
 * Unified Cache System
 * 
 * Schema:
 * - audio_cache: Per audio file (transcript, upload URL)
 * - job_cache: Per audio+style combination (story context, job metadata)
 * - segment_cache: Per segment (single source of truth for prompts, images, status)
 * 
 * Segments are the atomic unit. Job-level aggregates (image_queries, downloaded_images)
 * are reconstructed from segments on demand - no duplication.
 */

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { PATHS } from "../../config/index.ts";
import type { AssemblyAIWord, TranscriptSegment, ImageSearchQuery, DownloadedImage } from "../../types/index.ts";
import * as logger from "../../utils/logger.ts";

const CACHE_DB_PATH = PATHS.cache;

// ============================================================
// TYPES
// ============================================================

export interface AudioCache {
    audio_hash: string;
    audio_filename: string;
    audio_path: string | null;
    upload_url: string | null;
    transcript_id: string | null;
    transcript_words: string | null;  // JSON
    audio_duration: number | null;
}

export interface JobCache {
    audio_hash: string;
    style_id: string;
    orientation: string;
    natural_edit: number;
    segments: string | null;           // JSON of TranscriptSegment[]
    formatted_transcript: string | null;
    story_context: string | null;      // JSON of StoryContext
}

export interface SegmentCache {
    audio_hash: string;
    style_id: string;
    orientation: string;
    natural_edit: number;
    segment_index: number;             // 1-based
    total_segments: number;
    original_prompt: string;
    current_prompt: string;            // May differ after safety rewrites
    structured_shot: string;           // JSON of StructuredShot
    rewrite_count: number;
    status: 'pending' | 'approved' | 'failed';
    seed: number | null;
    image_path: string | null;
}

// Composite key for job-level operations
export interface JobKey {
    audioHash: string;
    styleId: string;
    orientation: string;
    naturalEdit: boolean;
}

// Composite key for segment-level operations
export interface SegmentKey extends JobKey {
    segmentIndex: number;  // 1-based
}

// ============================================================
// DATABASE SETUP
// ============================================================

let db: Database | null = null;

function getDb(): Database {
    if (!db) {
        const dbDir = dirname(CACHE_DB_PATH);
        if (!existsSync(dbDir)) {
            Bun.spawnSync(["mkdir", "-p", dbDir]);
        }
        db = new Database(CACHE_DB_PATH);

        // Enable WAL mode for better concurrency (prevents "database is locked")
        db.run("PRAGMA journal_mode = WAL");
        db.run("PRAGMA busy_timeout = 5000");

        initSchema();
    }
    return db;
}

function initSchema(): void {
    const database = db!;

    database.run(`
        CREATE TABLE IF NOT EXISTS audio_cache (
            audio_hash TEXT PRIMARY KEY,
            audio_filename TEXT NOT NULL,
            audio_path TEXT,
            upload_url TEXT,
            transcript_id TEXT,
            transcript_words TEXT,
            audio_duration REAL,
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    database.run(`
        CREATE TABLE IF NOT EXISTS job_cache (
            audio_hash TEXT NOT NULL,
            style_id TEXT NOT NULL,
            orientation TEXT NOT NULL DEFAULT 'horizontal',
            natural_edit INTEGER NOT NULL DEFAULT 0,
            segments TEXT,
            formatted_transcript TEXT,
            story_context TEXT,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (audio_hash, style_id, orientation, natural_edit)
        )
    `);

    database.run(`
        CREATE TABLE IF NOT EXISTS segment_cache (
            audio_hash TEXT NOT NULL,
            style_id TEXT NOT NULL,
            orientation TEXT NOT NULL DEFAULT 'horizontal',
            natural_edit INTEGER NOT NULL DEFAULT 0,
            segment_index INTEGER NOT NULL,
            total_segments INTEGER NOT NULL,
            original_prompt TEXT NOT NULL,
            current_prompt TEXT NOT NULL,
            structured_shot TEXT NOT NULL,
            rewrite_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            seed INTEGER,
            image_path TEXT,
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (audio_hash, style_id, orientation, natural_edit, segment_index)
        )
    `);

    // Migration: Convert old style_cache to new schema if exists
    migrateFromLegacy(database);

    logger.debug("Cache", `Database initialized at ${CACHE_DB_PATH}`);
}

function migrateFromLegacy(database: Database): void {
    try {
        const hasOldTable = database.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='style_cache'"
        ).get();

        if (hasOldTable) {
            // Migrate style_cache to job_cache (only the fields we still need)
            database.run(`
                INSERT OR IGNORE INTO job_cache 
                (audio_hash, style_id, orientation, natural_edit, segments, formatted_transcript, story_context)
                SELECT audio_hash, style_id, orientation, natural_edit, segments, formatted_transcript, story_context
                FROM style_cache
            `);
            logger.debug("Cache", "Migrated style_cache to job_cache");
        }
    } catch {
        // Table doesn't exist or migration already done
    }
}

// ============================================================
// UTILITIES
// ============================================================

export async function hashAudioFile(filePath: string): Promise<string> {
    const fileBuffer = await readFile(filePath);
    return createHash("md5").update(fileBuffer).digest("hex");
}

function toNaturalEditInt(naturalEdit: boolean): number {
    return naturalEdit ? 1 : 0;
}

// ============================================================
// AUDIO CACHE
// ============================================================

export function getAudioCache(audioHash: string): AudioCache | null {
    return getDb().prepare("SELECT * FROM audio_cache WHERE audio_hash = ?").get(audioHash) as AudioCache | null;
}

export function setAudioCache(audioHash: string, data: Partial<Omit<AudioCache, 'audio_hash'>>): void {
    const database = getDb();

    // Use UPSERT pattern: INSERT or UPDATE in a single atomic operation
    database.prepare(`
        INSERT INTO audio_cache (
            audio_hash, 
            audio_filename, 
            audio_path, 
            upload_url, 
            transcript_id, 
            transcript_words, 
            audio_duration
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(audio_hash) DO UPDATE SET
            audio_filename = COALESCE(excluded.audio_filename, audio_filename),
            audio_path = COALESCE(excluded.audio_path, audio_path),
            upload_url = COALESCE(excluded.upload_url, upload_url),
            transcript_id = COALESCE(excluded.transcript_id, transcript_id),
            transcript_words = COALESCE(excluded.transcript_words, transcript_words),
            audio_duration = COALESCE(excluded.audio_duration, audio_duration),
            updated_at = strftime('%s', 'now')
    `).run(
        audioHash,
        data.audio_filename ?? 'unknown',  // NOT NULL column - use fallback
        data.audio_path ?? null,
        data.upload_url ?? null,
        data.transcript_id ?? null,
        data.transcript_words ?? null,
        data.audio_duration ?? null
    );
}

// Convenience accessors
export function getCachedUploadUrl(audioHash: string): string | null {
    return getAudioCache(audioHash)?.upload_url ?? null;
}

export function getCachedTranscript(audioHash: string): { transcriptId: string; words: AssemblyAIWord[]; audioDuration: number | null } | null {
    const cache = getAudioCache(audioHash);
    if (!cache?.transcript_id || !cache?.transcript_words) return null;
    try {
        return {
            transcriptId: cache.transcript_id,
            words: JSON.parse(cache.transcript_words),
            audioDuration: cache.audio_duration,
        };
    } catch {
        return null;
    }
}

// ============================================================
// JOB CACHE
// ============================================================

export function getJobCache(key: JobKey): JobCache | null {
    return getDb().prepare(`
        SELECT * FROM job_cache 
        WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND natural_edit = ?
    `).get(key.audioHash, key.styleId, key.orientation, toNaturalEditInt(key.naturalEdit)) as JobCache | null;
}

export function setJobCache(key: JobKey, data: Partial<Pick<JobCache, 'segments' | 'formatted_transcript' | 'story_context'>>): void {
    const database = getDb();
    const ne = toNaturalEditInt(key.naturalEdit);

    database.prepare(`
        INSERT INTO job_cache (audio_hash, style_id, orientation, natural_edit)
        VALUES (?, ?, ?, ?)
        ON CONFLICT DO NOTHING
    `).run(key.audioHash, key.styleId, key.orientation, ne);

    const updates = Object.entries(data)
        .filter(([_, v]) => v !== undefined)
        .map(([k]) => `${k} = ?`)
        .join(", ");

    if (updates) {
        const values = Object.values(data).filter(v => v !== undefined);
        database.prepare(`
            UPDATE job_cache SET ${updates}, updated_at = strftime('%s', 'now')
            WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND natural_edit = ?
        `).run(...values, key.audioHash, key.styleId, key.orientation, ne);
    }
}

// Convenience accessors - overloaded for backward compatibility
export function getCachedStoryContext(key: JobKey): unknown | null;
export function getCachedStoryContext(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean): unknown | null;
export function getCachedStoryContext(keyOrHash: JobKey | string, styleId?: string, orientation?: string, naturalEdit?: boolean): unknown | null {
    const key: JobKey = typeof keyOrHash === 'string'
        ? { audioHash: keyOrHash, styleId: styleId!, orientation: orientation!, naturalEdit: naturalEdit! }
        : keyOrHash;

    const cache = getJobCache(key);
    if (!cache?.story_context) return null;
    try {
        return JSON.parse(cache.story_context);
    } catch {
        return null;
    }
}

// ============================================================
// SEGMENT CACHE - Single source of truth for prompts & images
// ============================================================

export function getSegment(key: SegmentKey): SegmentCache | null {
    return getDb().prepare(`
        SELECT * FROM segment_cache 
        WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND natural_edit = ? AND segment_index = ?
    `).get(key.audioHash, key.styleId, key.orientation, toNaturalEditInt(key.naturalEdit), key.segmentIndex) as SegmentCache | null;
}

export function getAllSegments(key: JobKey): SegmentCache[] {
    return getDb().prepare(`
        SELECT * FROM segment_cache 
        WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND natural_edit = ?
        ORDER BY segment_index ASC
    `).all(key.audioHash, key.styleId, key.orientation, toNaturalEditInt(key.naturalEdit)) as SegmentCache[];
}

export function upsertSegment(key: SegmentKey, data: {
    totalSegments: number;
    originalPrompt: string;
    currentPrompt: string;
    structuredShot: string;
    seed?: number;
}): void {
    const database = getDb();
    const ne = toNaturalEditInt(key.naturalEdit);

    database.prepare(`
        INSERT INTO segment_cache 
        (audio_hash, style_id, orientation, natural_edit, segment_index, total_segments, original_prompt, current_prompt, structured_shot, seed, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON CONFLICT (audio_hash, style_id, orientation, natural_edit, segment_index) 
        DO UPDATE SET 
            original_prompt = excluded.original_prompt,
            current_prompt = excluded.current_prompt,
            structured_shot = excluded.structured_shot,
            seed = COALESCE(excluded.seed, seed),
            total_segments = excluded.total_segments,
            updated_at = strftime('%s', 'now')
    `).run(
        key.audioHash, key.styleId, key.orientation, ne, key.segmentIndex,
        data.totalSegments, data.originalPrompt, data.currentPrompt, data.structuredShot, data.seed ?? null
    );
}

export function updateSegmentStatus(key: SegmentKey, status: 'pending' | 'approved' | 'failed', imagePath?: string, seed?: number): void {
    const database = getDb();
    const ne = toNaturalEditInt(key.naturalEdit);

    database.prepare(`
        UPDATE segment_cache 
        SET status = ?, image_path = COALESCE(?, image_path), seed = COALESCE(?, seed), updated_at = strftime('%s', 'now')
        WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND natural_edit = ? AND segment_index = ?
    `).run(status, imagePath ?? null, seed ?? null, key.audioHash, key.styleId, key.orientation, ne, key.segmentIndex);
}

export function updateSegmentRewrite(key: SegmentKey, newPrompt: string, rewriteCount: number): void {
    const database = getDb();
    const ne = toNaturalEditInt(key.naturalEdit);

    database.prepare(`
        UPDATE segment_cache 
        SET current_prompt = ?, rewrite_count = ?, status = 'pending', updated_at = strftime('%s', 'now')
        WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND natural_edit = ? AND segment_index = ?
    `).run(newPrompt, rewriteCount, key.audioHash, key.styleId, key.orientation, ne, key.segmentIndex);
}

// ============================================================
// DERIVED DATA - Reconstructed from segments, not stored twice
// ============================================================

/**
 * Reconstruct image queries from segment cache.
 * This is the single source of truth - no separate storage.
 */
export function getImageQueries(key: JobKey): ImageSearchQuery[] | null {
    const segments = getAllSegments(key);
    if (segments.length === 0) return null;

    return segments.map(seg => {
        const shot = JSON.parse(seg.structured_shot);
        return {
            start: shot.start,
            end: shot.end,
            query: seg.current_prompt,  // Use current (potentially rewritten) prompt
            type: shot.type,
        };
    });
}

/**
 * Reconstruct downloaded images from segment cache.
 * Only returns images that exist on disk.
 */
export function getDownloadedImages(key: JobKey): DownloadedImage[] | null {
    const segments = getAllSegments(key).filter(s => s.status === 'approved' && s.image_path);

    if (segments.length === 0) return null;

    const images: DownloadedImage[] = [];
    for (const seg of segments) {
        if (!seg.image_path || !existsSync(seg.image_path)) {
            return null;  // Incomplete - some images missing
        }
        const shot = JSON.parse(seg.structured_shot);
        images.push({
            query: seg.current_prompt,
            start: shot.start,
            end: shot.end,
            filePath: seg.image_path,
            type: shot.type,
            seed: seg.seed ?? undefined,
        });
    }

    return images;
}

/**
 * Get cached images for resume - returns only images that exist on disk.
 * Unlike getDownloadedImages, this doesn't fail if some images are missing.
 * Images are returned in segment order (sorted by segment_index).
 */
export function getCachedImagesForResume(key: JobKey): DownloadedImage[] {
    const segments = getAllSegments(key)
        .filter(s => s.status === 'approved' && s.image_path && existsSync(s.image_path))
        .sort((a, b) => a.segment_index - b.segment_index);

    const images: DownloadedImage[] = [];
    for (const seg of segments) {
        try {
            const shot = JSON.parse(seg.structured_shot);
            images.push({
                query: seg.current_prompt,
                start: shot.start,
                end: shot.end,
                filePath: seg.image_path!,
                type: shot.type,
                seed: seg.seed ?? undefined,
            });
        } catch {
            // Skip segments with invalid JSON
        }
    }

    return images;
}

/**
 * Get resume state for a job - where to continue from.
 */
export function getResumeState(key: JobKey): {
    completedCount: number;
    totalCount: number;
    nextIndex: number | null;
    isComplete: boolean;
} {
    const segments = getAllSegments(key);
    if (segments.length === 0) {
        return { completedCount: 0, totalCount: 0, nextIndex: null, isComplete: false };
    }

    const total = segments[0]?.total_segments || segments.length;
    const approved = segments.filter(s => s.status === 'approved' && s.image_path && existsSync(s.image_path));
    const pending = segments.find(s => s.status === 'pending');

    return {
        completedCount: approved.length,
        totalCount: total,
        nextIndex: pending?.segment_index ?? null,
        isComplete: approved.length >= total,
    };
}

/**
 * Get LLM batch resume state - determines which batch to resume from
 * and provides the last queries for visual continuity (BatchState).
 */
export function getLLMResumeState(key: JobKey, batchSize: number): {
    cachedCount: number;
    totalSegments: number;
    resumeBatchIndex: number;
    lastQueries: string[];  // Last 3 queries for BatchState continuity
    isComplete: boolean;
} {
    const segments = getAllSegments(key);
    if (segments.length === 0) {
        return { cachedCount: 0, totalSegments: 0, resumeBatchIndex: 0, lastQueries: [], isComplete: false };
    }

    const total = segments[0]?.total_segments || 0;
    const cachedCount = segments.length;

    // Calculate which batch to resume from (0-indexed)
    // If we have 180 segments and batch size is 60, we've completed batches 0,1,2 → resume from 3
    const resumeBatchIndex = Math.floor(cachedCount / batchSize);

    // Get last 3 queries for visual continuity (BatchState.lastQueries)
    // These are passed to the LLM to maintain visual flow
    const sortedSegments = [...segments].sort((a, b) => b.segment_index - a.segment_index);
    const lastQueries = sortedSegments
        .slice(0, 3)
        .reverse()
        .map(s => s.current_prompt);

    return {
        cachedCount,
        totalSegments: total,
        resumeBatchIndex,
        lastQueries,
        isComplete: cachedCount >= total,
    };
}

// ============================================================
// CACHE MANAGEMENT
// ============================================================

export function clearJobSegments(key: JobKey): number {
    const result = getDb().prepare(`
        DELETE FROM segment_cache 
        WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND natural_edit = ?
    `).run(key.audioHash, key.styleId, key.orientation, toNaturalEditInt(key.naturalEdit));
    return result.changes;
}

export function clearAllCache(): { audioCount: number; jobCount: number; segmentCount: number } {
    const database = getDb();
    const audioCount = (database.prepare("SELECT COUNT(*) as c FROM audio_cache").get() as { c: number })?.c || 0;
    const jobCount = (database.prepare("SELECT COUNT(*) as c FROM job_cache").get() as { c: number })?.c || 0;
    const segmentCount = (database.prepare("SELECT COUNT(*) as c FROM segment_cache").get() as { c: number })?.c || 0;

    database.run("DELETE FROM segment_cache");
    database.run("DELETE FROM job_cache");
    database.run("DELETE FROM audio_cache");

    logger.success("Cache", `Cleared ${audioCount} audio, ${jobCount} job, ${segmentCount} segment entries`);
    return { audioCount, jobCount, segmentCount };
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
    }
}

// getCachedSegments - Single signature (no overload, uses JobKey only)
export function getCachedSegments(key: JobKey): { segments: TranscriptSegment[]; formattedTranscript: string } | null {
    const cache = getJobCache(key);
    if (!cache?.segments || !cache?.formatted_transcript) return null;
    try {
        return { segments: JSON.parse(cache.segments), formattedTranscript: cache.formatted_transcript };
    } catch {
        return null;
    }
}
