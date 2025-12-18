/**
 * SQLite Cache Service for workflow step caching
 * Uses Bun's built-in SQLite support to avoid redundant API calls
 * 
 * Cache Structure:
 * - audio_cache: Shared data per audio file (upload, transcript)
 * - style_cache: Style-specific data per audio+style (segmentation, images)
 * 
 * Cached Steps:
 * 1. AssemblyAI Upload URL (shared)
 * 2. Transcription (shared - transcript ID, words, duration)
 * 3. Segmentation (style-specific)
 * 4. LLM Image Queries (style-specific)
 * 5. Downloaded/Generated Images (style-specific)
 * 
 * NOT Cached: Video generation (always regenerates with FFmpeg)
 */

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { PATHS } from "../../config/environment.ts";
import type { AssemblyAIWord, TranscriptSegment, ImageSearchQuery, DownloadedImage } from "../../types/index.ts";
import * as logger from "../../utils/logger.ts";

const CACHE_DB_PATH = PATHS.cache;

/**
 * Shared audio cache entry (per audio file)
 */
export interface AudioCacheEntry {
    id: number;
    audio_hash: string;
    audio_filename: string;
    audio_path: string | null;
    upload_url: string | null;
    transcript_id: string | null;
    transcript_status: string | null;
    transcript_words: string | null;
    audio_duration: number | null;
    created_at: number;
    updated_at: number;
}

/**
 * Style-specific cache entry (per audio + style + orientation + multi_image combination)
 */
export interface StyleCacheEntry {
    id: number;
    audio_hash: string;
    style_id: string;
    orientation: string;
    multi_image: number;  // 0 or 1 (SQLite boolean)
    segments: string | null;
    formatted_transcript: string | null;
    image_queries: string | null;
    downloaded_images: string | null;
    created_at: number;
    updated_at: number;
}

/**
 * Partial audio cache data for updates
 */
export interface AudioCacheUpdate {
    audio_filename?: string;
    audio_path?: string;
    upload_url?: string;
    transcript_id?: string;
    transcript_status?: string;
    transcript_words?: string;
    audio_duration?: number;
}

/**
 * Partial style cache data for updates
 */
export interface StyleCacheUpdate {
    segments?: string;
    formatted_transcript?: string;
    image_queries?: string;
    downloaded_images?: string;
}

// Singleton database instance
let db: Database | null = null;

/**
 * Initialize the SQLite database and create tables if needed
 */
export function initDatabase(): void {
    if (db) return;

    // Ensure directory exists
    const dbDir = dirname(CACHE_DB_PATH);
    if (!existsSync(dbDir)) {
        Bun.spawnSync(["mkdir", "-p", dbDir]);
    }

    db = new Database(CACHE_DB_PATH);

    // Create shared audio cache table
    db.run(`
    CREATE TABLE IF NOT EXISTS audio_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audio_hash TEXT UNIQUE NOT NULL,
      audio_filename TEXT NOT NULL,
      audio_path TEXT,
      upload_url TEXT,
      transcript_id TEXT,
      transcript_status TEXT,
      transcript_words TEXT,
      audio_duration REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    // Create style-specific cache table with orientation and multi_image
    // The unique key is (audio_hash, style_id, orientation, multi_image) to cache
    // different configurations separately
    db.run(`
    CREATE TABLE IF NOT EXISTS style_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audio_hash TEXT NOT NULL,
      style_id TEXT NOT NULL,
      orientation TEXT NOT NULL DEFAULT 'horizontal',
      multi_image INTEGER NOT NULL DEFAULT 0,
      segments TEXT,
      formatted_transcript TEXT,
      image_queries TEXT,
      downloaded_images TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(audio_hash, style_id, orientation, multi_image)
    )
  `);

    // // Migration: Add orientation column if it doesn't exist (for existing databases)
    // // SQLite doesn't have IF NOT EXISTS for columns, so we check pragma first
    // try {
    //     const columns = db.prepare("PRAGMA table_info(style_cache)").all() as Array<{ name: string }>;
    //     const hasOrientation = columns.some(col => col.name === "orientation");
    //     if (!hasOrientation) {
    //         logger.log("Cache", "Migrating style_cache table: adding orientation column");
    //         db.run("ALTER TABLE style_cache ADD COLUMN orientation TEXT NOT NULL DEFAULT 'horizontal'");
    //         // Recreate unique index for new schema
    //         db.run("DROP INDEX IF EXISTS idx_style_cache");
    //     }
    // } catch (error) {
    //     // Table might be new, ignore migration errors
    //     logger.debug("Cache", "Migration check completed (table may be new)");
    // }

    // Create indexes for fast lookups
    db.run(`CREATE INDEX IF NOT EXISTS idx_audio_hash ON audio_cache(audio_hash)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_style_cache ON style_cache(audio_hash, style_id, orientation, multi_image)`);

    logger.debug("Cache", `Database initialized at ${CACHE_DB_PATH}`);
}

/**
 * Get the database instance, initializing if needed
 */
function getDb(): Database {
    if (!db) {
        initDatabase();
    }
    return db!;
}

/**
 * Generate MD5 hash of an audio file for identification
 * @param filePath - Path to the audio file
 * @returns MD5 hash string
 */
export async function hashAudioFile(filePath: string): Promise<string> {
    const fileBuffer = await readFile(filePath);
    const hash = createHash("md5").update(fileBuffer).digest("hex");
    logger.debug("Cache", `Audio hash: ${hash} (${filePath})`);
    return hash;
}

// ============================================================
// AUDIO CACHE (Shared per audio file)
// ============================================================

/**
 * Get audio cache entry by audio hash
 * @param audioHash - MD5 hash of the audio file
 * @returns Cache entry or null if not found
 */
export function getAudioCache(audioHash: string): AudioCacheEntry | null {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM audio_cache WHERE audio_hash = ?");
    const result = stmt.get(audioHash) as AudioCacheEntry | null;

    if (result) {
        logger.debug("Cache", `Found audio cache for hash ${audioHash.substring(0, 8)}...`);
    }

    return result;
}

/**
 * Create or update audio cache entry
 * @param audioHash - MD5 hash of the audio file
 * @param data - Partial cache data to update
 */
export function updateAudioCache(audioHash: string, data: AudioCacheUpdate): void {
    const database = getDb();
    const existing = getAudioCache(audioHash);

    if (existing) {
        // Build UPDATE query dynamically
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length > 0) {
            fields.push("updated_at = strftime('%s', 'now')");
            values.push(audioHash);

            const sql = `UPDATE audio_cache SET ${fields.join(", ")} WHERE audio_hash = ?`;
            const stmt = database.prepare(sql);
            stmt.run(...values);
            logger.debug("Cache", `Updated audio cache for hash ${audioHash.substring(0, 8)}...`);
        }
    } else {
        // INSERT new entry
        const filename = data.audio_filename || "unknown";
        const insertStmt = database.prepare(
            `INSERT INTO audio_cache (audio_hash, audio_filename) VALUES (?, ?)`
        );
        insertStmt.run(audioHash, filename);

        // Now update with remaining data
        if (Object.keys(data).length > 1 || !data.audio_filename) {
            updateAudioCache(audioHash, data);
        }

        logger.debug("Cache", `Created audio cache for hash ${audioHash.substring(0, 8)}...`);
    }
}

// ============================================================
// STYLE CACHE (Per audio + style + orientation combination)
// ============================================================

/**
 * Get style-specific cache entry
 * @param audioHash - MD5 hash of the audio file
 * @param styleId - Style ID
 * @param orientation - Video orientation (horizontal or vertical)
 * @param multiImage - Whether multi-image mode is enabled
 * @returns Style cache entry or null if not found
 */
export function getStyleCache(audioHash: string, styleId: string, orientation: string = "horizontal", multiImage: boolean = false): StyleCacheEntry | null {
    const database = getDb();
    const stmt = database.prepare(
        "SELECT * FROM style_cache WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND multi_image = ?"
    );
    const result = stmt.get(audioHash, styleId, orientation, multiImage ? 1 : 0) as StyleCacheEntry | null;

    if (result) {
        logger.debug("Cache", `Found style cache for ${audioHash.substring(0, 8)}... + ${styleId} (${orientation}, multi:${multiImage})`);
    }

    return result;
}

/**
 * Create or update style-specific cache entry
 * @param audioHash - MD5 hash of the audio file
 * @param styleId - Style ID
 * @param orientation - Video orientation (horizontal or vertical)
 * @param multiImage - Whether multi-image mode is enabled
 * @param data - Partial cache data to update
 */
export function updateStyleCache(audioHash: string, styleId: string, orientation: string, multiImage: boolean, data: StyleCacheUpdate): void {
    const database = getDb();
    const existing = getStyleCache(audioHash, styleId, orientation, multiImage);
    const multiImageInt = multiImage ? 1 : 0;

    if (existing) {
        // Build UPDATE query dynamically
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length > 0) {
            fields.push("updated_at = strftime('%s', 'now')");
            values.push(audioHash, styleId, orientation, multiImageInt);

            const sql = `UPDATE style_cache SET ${fields.join(", ")} WHERE audio_hash = ? AND style_id = ? AND orientation = ? AND multi_image = ?`;
            const stmt = database.prepare(sql);
            stmt.run(...values);
            logger.debug("Cache", `Updated style cache for ${audioHash.substring(0, 8)}... + ${styleId} (${orientation}, multi:${multiImage})`);
        }
    } else {
        // INSERT new entry
        const insertStmt = database.prepare(
            `INSERT INTO style_cache (audio_hash, style_id, orientation, multi_image) VALUES (?, ?, ?, ?)`
        );
        insertStmt.run(audioHash, styleId, orientation, multiImageInt);

        // Now update with remaining data
        if (Object.keys(data).length > 0) {
            updateStyleCache(audioHash, styleId, orientation, multiImage, data);
        }

        logger.debug("Cache", `Created style cache for ${audioHash.substring(0, 8)}... + ${styleId} (${orientation}, multi:${multiImage})`);
    }
}

// ============================================================
// Cache Deletion
// ============================================================

/**
 * Delete audio cache and all associated style caches
 * @param audioHash - MD5 hash of the audio file
 */
export function deleteCache(audioHash: string): void {
    const database = getDb();

    // Delete style caches first
    const styleStmt = database.prepare("DELETE FROM style_cache WHERE audio_hash = ?");
    styleStmt.run(audioHash);

    // Delete audio cache
    const audioStmt = database.prepare("DELETE FROM audio_cache WHERE audio_hash = ?");
    audioStmt.run(audioHash);

    logger.debug("Cache", `Deleted all cache for hash ${audioHash.substring(0, 8)}...`);
}

/**
 * Clear all cache entries from the database
 * @returns Object with count of deleted entries
 */
export function clearAllCache(): { audioCount: number; styleCount: number } {
    const database = getDb();

    // Get counts before deletion
    const audioCount = (database.prepare("SELECT COUNT(*) as count FROM audio_cache").get() as { count: number })?.count || 0;
    const styleCount = (database.prepare("SELECT COUNT(*) as count FROM style_cache").get() as { count: number })?.count || 0;

    // Delete all entries
    database.run("DELETE FROM style_cache");
    database.run("DELETE FROM audio_cache");

    logger.success("Cache", `Cleared ${audioCount} audio + ${styleCount} style cache entries`);

    return { audioCount, styleCount };
}

// ============================================================
// Step-Specific Cache Helpers (Shared)
// ============================================================

/**
 * Get cached upload URL
 * @param audioHash - Audio file hash
 * @returns Upload URL or null
 */
export function getCachedUploadUrl(audioHash: string): string | null {
    const cache = getAudioCache(audioHash);
    return cache?.upload_url || null;
}

/**
 * Get cached transcript data
 * @param audioHash - Audio file hash
 * @returns Transcript data or null
 */
export function getCachedTranscript(audioHash: string): {
    transcriptId: string;
    words: AssemblyAIWord[];
    audioDuration: number | null;
} | null {
    const cache = getAudioCache(audioHash);

    if (cache?.transcript_id && cache?.transcript_words) {
        try {
            const words = JSON.parse(cache.transcript_words) as AssemblyAIWord[];
            return {
                transcriptId: cache.transcript_id,
                words,
                audioDuration: cache.audio_duration,
            };
        } catch {
            logger.warn("Cache", "Failed to parse cached transcript words");
            return null;
        }
    }

    return null;
}

// ============================================================
// Step-Specific Cache Helpers (Style-Specific)
// ============================================================

/**
 * Get cached segments (style-specific)
 * @param audioHash - Audio file hash
 * @param styleId - Style ID
 * @param orientation - Video orientation (horizontal or vertical)
 * @param multiImage - Whether multi-image mode is enabled
 * @returns Segments data or null
 */
export function getCachedSegments(audioHash: string, styleId: string, orientation: string = "horizontal", multiImage: boolean = false): {
    segments: TranscriptSegment[];
    formattedTranscript: string;
} | null {
    const cache = getStyleCache(audioHash, styleId, orientation, multiImage);

    if (cache?.segments && cache?.formatted_transcript) {
        try {
            const segments = JSON.parse(cache.segments) as TranscriptSegment[];
            return {
                segments,
                formattedTranscript: cache.formatted_transcript,
            };
        } catch {
            logger.warn("Cache", "Failed to parse cached segments");
            return null;
        }
    }

    return null;
}

/**
 * Get cached image queries (style-specific)
 * @param audioHash - Audio file hash
 * @param styleId - Style ID
 * @param orientation - Video orientation (horizontal or vertical)
 * @param multiImage - Whether multi-image mode is enabled
 * @returns Image queries or null
 */
export function getCachedImageQueries(audioHash: string, styleId: string, orientation: string = "horizontal", multiImage: boolean = false): ImageSearchQuery[] | null {
    const cache = getStyleCache(audioHash, styleId, orientation, multiImage);

    if (cache?.image_queries) {
        try {
            return JSON.parse(cache.image_queries) as ImageSearchQuery[];
        } catch {
            logger.warn("Cache", "Failed to parse cached image queries");
            return null;
        }
    }

    return null;
}

/**
 * Get cached downloaded images (style-specific, with file existence verification)
 * @param audioHash - Audio file hash
 * @param styleId - Style ID
 * @param orientation - Video orientation (horizontal or vertical)
 * @param multiImage - Whether multi-image mode is enabled
 * @returns Downloaded images or null (returns null if any file is missing)
 */
export function getCachedImages(audioHash: string, styleId: string, orientation: string = "horizontal", multiImage: boolean = false): DownloadedImage[] | null {
    const cache = getStyleCache(audioHash, styleId, orientation, multiImage);

    if (cache?.downloaded_images) {
        try {
            const images = JSON.parse(cache.downloaded_images) as DownloadedImage[];

            // Verify all image files still exist
            for (const image of images) {
                if (!existsSync(image.filePath)) {
                    logger.warn("Cache", `Cached image file missing: ${image.filePath}`);
                    return null;
                }
            }

            return images;
        } catch {
            logger.warn("Cache", "Failed to parse cached images");
            return null;
        }
    }

    return null;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        logger.debug("Cache", "Database connection closed");
    }
}