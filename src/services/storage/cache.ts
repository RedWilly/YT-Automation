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
    const existing = getAudioCache(audioHash);

    if (existing) {
        const updates = Object.entries(data)
            .filter(([_, v]) => v !== undefined)
            .map(([k]) => `${k} = @${k}`)
            .join(", ");
        if (updates) {
            database.prepare(`UPDATE audio_cache SET ${updates}, updated_at = strftime('%s', 'now') WHERE audio_hash = @audio_hash`)
                .run({ audio_hash: audioHash, ...data });
        }
    } else {
        database.prepare(`INSERT INTO audio_cache (audio_hash, audio_filename) VALUES (?, ?)`)
            .run(audioHash, data.audio_filename || "unknown");
        if (Object.keys(data).length > 1 || !data.audio_filename) {
            setAudioCache(audioHash, data);
        }
    }
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

// ============================================================
// LEGACY COMPATIBILITY - Thin wrappers for gradual migration
// ============================================================

/** @deprecated Use setJobCache with JobKey */
export function updateStyleCache(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean, data: {
    segments?: string;
    formatted_transcript?: string;
    story_context?: string;
    image_queries?: string;      // Ignored - now derived from segments
    downloaded_images?: string;  // Ignored - now derived from segments
}): void {
    setJobCache({ audioHash, styleId, orientation, naturalEdit }, {
        segments: data.segments,
        formatted_transcript: data.formatted_transcript,
        story_context: data.story_context,
    });
}

/** @deprecated Use getJobCache with JobKey */
export function getStyleCache(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean): JobCache | null {
    return getJobCache({ audioHash, styleId, orientation, naturalEdit });
}

/** @deprecated Use getImageQueries */
export function getCachedImageQueries(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean): ImageSearchQuery[] | null {
    return getImageQueries({ audioHash, styleId, orientation, naturalEdit });
}

/** @deprecated Use getDownloadedImages */
export function getCachedImages(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean): DownloadedImage[] | null {
    return getDownloadedImages({ audioHash, styleId, orientation, naturalEdit });
}

/** @deprecated Use setAudioCache */
export function updateAudioCache(audioHash: string, data: Partial<Omit<AudioCache, 'audio_hash'>>): void {
    setAudioCache(audioHash, data);
}

// Re-export types for backward compatibility during migration
export type AudioCacheEntry = AudioCache;
export type StyleCacheEntry = JobCache;
export type SegmentPromptEntry = SegmentCache;
export type SegmentPromptKey = SegmentKey;

/** @deprecated Use getAllSegments */
export function getAllSegmentPrompts(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean): SegmentCache[] {
    return getAllSegments({ audioHash, styleId, orientation, naturalEdit });
}

// Overloaded getCachedSegments for backward compatibility
export function getCachedSegments(key: JobKey): { segments: TranscriptSegment[]; formattedTranscript: string } | null;
export function getCachedSegments(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean): { segments: TranscriptSegment[]; formattedTranscript: string } | null;
export function getCachedSegments(keyOrHash: JobKey | string, styleId?: string, orientation?: string, naturalEdit?: boolean): { segments: TranscriptSegment[]; formattedTranscript: string } | null {
    const key: JobKey = typeof keyOrHash === 'string'
        ? { audioHash: keyOrHash, styleId: styleId!, orientation: orientation!, naturalEdit: naturalEdit! }
        : keyOrHash;
    
    const cache = getJobCache(key);
    if (!cache?.segments || !cache?.formatted_transcript) return null;
    try {
        return { segments: JSON.parse(cache.segments), formattedTranscript: cache.formatted_transcript };
    } catch {
        return null;
    }
}

/** @deprecated Database is auto-initialized on first access */
export function initDatabase(): void {
    getDb();
}

/** @deprecated Use getResumeState */
export function getSegmentResumeState(audioHash: string, styleId: string, orientation: string, naturalEdit: boolean) {
    return getResumeState({ audioHash, styleId, orientation, naturalEdit });
}

/** @deprecated Use upsertSegment */
export function upsertSegmentPrompt(key: SegmentKey, data: { originalPrompt: string; currentPrompt: string; structuredShot: string; totalSegments: number; seed?: number }): void {
    upsertSegment(key, data);
}

/** @deprecated Use updateSegmentStatus */
export function markSegmentApproved(key: SegmentKey, imagePath: string, seed?: number): void {
    updateSegmentStatus(key, 'approved', imagePath, seed);
}

/** @deprecated Use updateSegmentStatus */
export function markSegmentFailed(key: SegmentKey): void {
    updateSegmentStatus(key, 'failed');
}
