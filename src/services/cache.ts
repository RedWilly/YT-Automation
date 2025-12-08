/**
 * SQLite Cache Service for workflow step caching
 * Uses Bun's built-in SQLite support to avoid redundant API calls
 * 
 * Cached Steps:
 * 1. AssemblyAI Upload URL
 * 2. Transcription (transcript ID, words, duration)
 * 3. Segmentation (segments, formatted transcript)
 * 4. LLM Image Queries
 * 5. Downloaded/Generated Images
 * 
 * NOT Cached: Video generation (always regenerates with FFmpeg)
 */

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { CACHE_DB_PATH } from "../constants.ts";
import type { AssemblyAIWord, TranscriptSegment, ImageSearchQuery, DownloadedImage } from "../types.ts";
import * as logger from "../logger.ts";

/**
 * Cache entry structure matching database schema
 */
export interface AudioCacheEntry {
    id: number;
    audio_hash: string;
    audio_filename: string;
    audio_path: string | null;

    // Step 1: Upload
    upload_url: string | null;

    // Step 2: Transcription
    transcript_id: string | null;
    transcript_status: string | null;
    transcript_words: string | null;
    audio_duration: number | null;

    // Step 3: Segmentation
    segments: string | null;
    formatted_transcript: string | null;
    style_id: string | null;

    // Step 4: LLM Queries
    image_queries: string | null;

    // Step 5: Images
    downloaded_images: string | null;

    // Metadata
    created_at: number;
    updated_at: number;
}

/**
 * Partial cache data for updates
 */
export interface CacheUpdate {
    audio_filename?: string;
    audio_path?: string;
    upload_url?: string;
    transcript_id?: string;
    transcript_status?: string;
    transcript_words?: string;
    audio_duration?: number;
    segments?: string;
    formatted_transcript?: string;
    style_id?: string;
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

    // Create table if not exists
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
      
      segments TEXT,
      formatted_transcript TEXT,
      style_id TEXT,
      
      image_queries TEXT,
      
      downloaded_images TEXT,
      
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    // Create index for fast lookups
    db.run(`CREATE INDEX IF NOT EXISTS idx_audio_hash ON audio_cache(audio_hash)`);

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

/**
 * Get cache entry by audio hash
 * @param audioHash - MD5 hash of the audio file
 * @returns Cache entry or null if not found
 */
export function getCache(audioHash: string): AudioCacheEntry | null {
    const database = getDb();
    const stmt = database.prepare("SELECT * FROM audio_cache WHERE audio_hash = ?");
    const result = stmt.get(audioHash) as AudioCacheEntry | null;

    if (result) {
        logger.debug("Cache", `Found cache entry for hash ${audioHash.substring(0, 8)}...`);
    }

    return result;
}

/**
 * Create or update cache entry
 * @param audioHash - MD5 hash of the audio file
 * @param data - Partial cache data to update
 */
export function updateCache(audioHash: string, data: CacheUpdate): void {
    const database = getDb();
    const existing = getCache(audioHash);

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
            logger.debug("Cache", `Updated cache for hash ${audioHash.substring(0, 8)}...`);
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
            updateCache(audioHash, data);
        }

        logger.debug("Cache", `Created cache entry for hash ${audioHash.substring(0, 8)}...`);
    }
}

/**
 * Delete a cache entry by audio hash
 * @param audioHash - MD5 hash of the audio file
 */
export function deleteCache(audioHash: string): void {
    const database = getDb();
    const stmt = database.prepare("DELETE FROM audio_cache WHERE audio_hash = ?");
    stmt.run(audioHash);
    logger.debug("Cache", `Deleted cache for hash ${audioHash.substring(0, 8)}...`);
}

/**
 * Clear all cache entries from the database
 * @returns Object with count of deleted entries
 */
export function clearAllCache(): { count: number } {
    const database = getDb();

    // Get count before deletion
    const countResult = database.prepare("SELECT COUNT(*) as count FROM audio_cache").get() as { count: number };
    const count = countResult?.count || 0;

    // Delete all entries
    database.run("DELETE FROM audio_cache");

    logger.success("Cache", `Cleared ${count} cache entries from database`);

    return { count };
}

// ============================================================
// Step-Specific Cache Helpers
// ============================================================

/**
 * Get cached upload URL
 * @param audioHash - Audio file hash
 * @returns Upload URL or null
 */
export function getCachedUploadUrl(audioHash: string): string | null {
    const cache = getCache(audioHash);
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
    const cache = getCache(audioHash);

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

/**
 * Get cached segments (style-specific)
 * @param audioHash - Audio file hash
 * @param styleId - Current style ID
 * @returns Segments data or null (returns null if style changed)
 */
export function getCachedSegments(audioHash: string, styleId: string): {
    segments: TranscriptSegment[];
    formattedTranscript: string;
} | null {
    const cache = getCache(audioHash);

    // Only use cache if same style was used
    if (cache?.segments && cache?.formatted_transcript && cache?.style_id === styleId) {
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
 * @param styleId - Current style ID
 * @returns Image queries or null
 */
export function getCachedImageQueries(audioHash: string, styleId: string): ImageSearchQuery[] | null {
    const cache = getCache(audioHash);

    // Only use cache if same style was used
    if (cache?.image_queries && cache?.style_id === styleId) {
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
 * Get cached downloaded images (with file existence verification)
 * @param audioHash - Audio file hash
 * @returns Downloaded images or null (returns null if any file is missing)
 */
export function getCachedImages(audioHash: string): DownloadedImage[] | null {
    const cache = getCache(audioHash);

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
