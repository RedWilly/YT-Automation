/**
 * Natural Segment Splitting
 * Splits long segments into smaller chunks for more natural video pacing
 * 
 * When naturalEdit is enabled, segments longer than 5 seconds get split
 * into 6-8 second chunks to create more dynamic visual transitions.
 */

import type { TranscriptSegment } from "../../types/index.ts";
import * as logger from "../../utils/logger.ts";

/** Minimum duration (ms) to trigger splitting */
const SPLIT_THRESHOLD_MS = 5000;  // 5 seconds

/** Target duration for split chunks (ms) */
const TARGET_CHUNK_MS = 7000;  // 7 seconds

/** Minimum chunk duration (ms) - don't create tiny segments */
const MIN_CHUNK_MS = 4000;  // 4 seconds

/** Maximum number of splits per segment */
const MAX_SPLITS_PER_SEGMENT = 4;

/**
 * Split long segments into smaller time-based chunks
 * Segments over 5 seconds get divided into ~7 second pieces
 * 
 * @param segments - Original transcript segments
 * @returns New array with long segments split into smaller chunks
 */
export function splitLongSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
    const result: TranscriptSegment[] = [];
    let newIndex = 0;

    for (const segment of segments) {
        const duration = segment.end - segment.start;

        // If segment is short enough, keep as is
        if (duration <= SPLIT_THRESHOLD_MS) {
            result.push({
                ...segment,
                index: newIndex++,
            });
            continue;
        }

        // Calculate how many chunks we need
        const idealChunks = Math.ceil(duration / TARGET_CHUNK_MS);
        const chunks = Math.min(idealChunks, MAX_SPLITS_PER_SEGMENT);

        // Calculate chunk duration (distribute time evenly)
        const chunkDuration = Math.floor(duration / chunks);

        // Split the segment text proportionally (rough word-based split)
        const words = segment.text.split(/\s+/);
        const wordsPerChunk = Math.ceil(words.length / chunks);

        logger.debug(
            "NaturalSplit",
            `Splitting segment ${segment.index} (${Math.round(duration / 1000)}s) into ${chunks} chunks`
        );

        for (let i = 0; i < chunks; i++) {
            // Calculate time range for this chunk
            const chunkStart = segment.start + (i * chunkDuration);
            const chunkEnd = i === chunks - 1
                ? segment.end  // Last chunk gets remaining time
                : chunkStart + chunkDuration;

            // Get words for this chunk
            const startWord = i * wordsPerChunk;
            const endWord = i === chunks - 1
                ? words.length  // Last chunk gets remaining words
                : startWord + wordsPerChunk;
            const chunkText = words.slice(startWord, endWord).join(" ");

            result.push({
                index: newIndex++,
                text: chunkText,
                start: chunkStart,
                end: chunkEnd,
            });
        }
    }

    if (result.length > segments.length) {
        logger.log(
            "NaturalSplit",
            `Expanded ${segments.length} segments → ${result.length} segments for natural editing`
        );
    }

    return result;
}

/**
 * Format segments for LLM prompt with shot type annotations
 * When naturalEdit is enabled, adds instructions for the LLM to assign shot types
 * 
 * @param segments - Transcript segments (already split if naturalEdit was enabled)
 * @param naturalEdit - Whether natural editing mode is active
 * @returns Formatted transcript string for LLM
 */
export function formatSegmentsForLLM(
    segments: TranscriptSegment[],
    naturalEdit: boolean
): string {
    const lines: string[] = [];

    for (const segment of segments) {
        // Format: [start-end ms]: text
        const timeRange = `${segment.start}–${segment.end}ms`;

        if (naturalEdit) {
            // Add segment number for context (helps LLM understand flow)
            lines.push(`[${timeRange}] #${segment.index + 1}: ${segment.text}`);
        } else {
            lines.push(`[${timeRange}]: ${segment.text}`);
        }
    }

    return lines.join("\n");
}
