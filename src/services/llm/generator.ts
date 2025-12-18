/**
 * Image Query Generator
 * Generates image search queries from transcripts using LLM
 */

import { AI_TEXT } from "../../config/environment.ts";
import { DEFAULT_LLM_SETTINGS } from "../../config/defaults.ts";
import type { ImageSearchQuery } from "../../types/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import * as logger from "../../utils/logger.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.ts";
import { callLLMWithRetry } from "./client.ts";
import { validateImageQueries } from "./parser.ts";

const AI_PROVIDER = AI_TEXT.provider;
const LLM_SEGMENTS_PER_BATCH = AI_TEXT.segmentsPerBatch;
const USE_AI_IMAGE = AI_TEXT.useAiImage;

/** Maximum number of retry attempts for LLM requests per batch */
const LLM_MAX_RETRIES = 2;

/**
 * Generate image search queries from formatted transcript
 * @param formattedTranscript - Formatted transcript with timestamps
 * @param style - Resolved style configuration for style-specific prompts
 * @returns Array of image search queries with timestamps
 */
export async function generateImageQueries(
    formattedTranscript: string,
    style: ResolvedStyle
): Promise<ImageSearchQuery[]> {
    // Split transcript into segment lines
    const lines = formattedTranscript
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const segmentCount = lines.length;
    logger.step(
        "LLM",
        `Generating image search queries using ${AI_PROVIDER}`,
        `${segmentCount} segments, style: ${style.name}`
    );

    // Build system prompt with style-specific context
    const systemPrompt = buildSystemPrompt(USE_AI_IMAGE, style);

    // Log whether AI style is being used
    if (USE_AI_IMAGE) {
        logger.log(
            "LLM",
            `🎨 AI image generation enabled - style: "${style.imageStyle.substring(0, 50)}..."`
        );
    } else {
        logger.log(
            "LLM",
            `🔍 Web image search enabled - optimizing queries for search results`
        );
    }

    // Calculate multi-image info if enabled
    let multiImageInfo: { enabled: boolean; expectedTotal: number; segmentImageCounts: number[] } | undefined;
    let annotatedTranscript = formattedTranscript;

    if (style.multiImageSegments) {
        const threshold = style.multiImageThreshold;
        const segmentImageCounts: number[] = [];
        const annotatedLines: string[] = [];

        for (const line of lines) {
            // Extract text after the timestamp marker
            const textMatch = line.match(/\[[\d–\-]+ms\]:\s*(.+)/);
            const segmentText = textMatch?.[1] ?? line;
            const wordCount = segmentText.split(/\s+/).length;

            // Calculate how many images this segment needs
            let imageCount = 1;
            if (wordCount > threshold) {
                // For longer segments, split into chunks based on threshold
                imageCount = Math.ceil(wordCount / threshold);
                // Cap at 3 images per segment to avoid too many
                imageCount = Math.min(imageCount, 3);
            }

            segmentImageCounts.push(imageCount);

            // Annotate the line with image count
            if (imageCount > 1) {
                const annotatedLine = line.replace(
                    /(\[\d+[–\-]\d+ms\]):?\s*/,
                    `$1 (${imageCount} images): `
                );
                annotatedLines.push(annotatedLine);
            } else {
                annotatedLines.push(line.replace(/(\[\d+[–\-]\d+ms\]):?\s*/, `$1 (1 image): `));
            }
        }

        const totalImages = segmentImageCounts.reduce((sum, count) => sum + count, 0);

        multiImageInfo = {
            enabled: true,
            expectedTotal: totalImages,
            segmentImageCounts,
        };

        annotatedTranscript = annotatedLines.join("\n");

        logger.log(
            "LLM",
            `📸 Multi-image mode: ${segmentCount} segments → ${totalImages} images (threshold: ${threshold} words)`
        );
    }

    // If small enough, single request
    const batchSize = LLM_SEGMENTS_PER_BATCH;
    if (segmentCount <= batchSize) {
        const userPrompt = buildUserPrompt(annotatedTranscript, segmentCount, USE_AI_IMAGE, multiImageInfo);
        const queries = await callLLMWithRetry(
            systemPrompt,
            userPrompt,
            "",
            LLM_MAX_RETRIES
        );
        logger.success(
            "LLM",
            `Generated ${queries.length} image search queries`
        );
        return queries;
    }

    // Batching path
    const batches: ImageSearchQuery[] = [];
    const totalBatches = Math.ceil(segmentCount / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * batchSize;
        const end = Math.min(start + batchSize, segmentCount);
        const batchLines = lines.slice(start, end);
        const batchFormatted = batchLines.join("\n");
        const expectedCount = batchLines.length;

        logger.step(
            "LLM",
            `Processing batch ${batchIndex + 1}/${totalBatches}`,
            `Segments ${start + 1}-${end}`
        );

        const userPrompt = buildUserPrompt(batchFormatted, expectedCount, USE_AI_IMAGE);
        const label = ` (batch ${batchIndex + 1})`;

        // Retry logic for batches that don't return the expected number of queries
        let queries: ImageSearchQuery[] = [];
        let retryAttempt = 0;
        const maxBatchRetries = LLM_MAX_RETRIES;

        while (retryAttempt <= maxBatchRetries) {
            queries = await callLLMWithRetry(
                systemPrompt,
                userPrompt,
                label,
                1 // Reduced retry limit for batch retries
            );

            // Check if we got the expected number of queries
            if (queries.length === expectedCount) {
                break; // Success!
            }

            // If not the expected count and we have retries left
            if (retryAttempt < maxBatchRetries) {
                logger.warn(
                    "LLM",
                    `Expected ${expectedCount} queries in batch ${batchIndex + 1}, got ${queries.length}. Retrying batch (attempt ${retryAttempt + 2}/${maxBatchRetries + 1})...`
                );
                retryAttempt++;
            } else {
                // Final attempt failed
                logger.warn(
                    "LLM",
                    `Expected ${expectedCount} queries in batch ${batchIndex + 1}, got ${queries.length} after ${maxBatchRetries + 1} attempts. Proceeding with partial results.`
                );
                break;
            }
        }

        validateImageQueries(queries);
        batches.push(...queries);
    }

    logger.success(
        "LLM",
        `Generated ${batches.length} image search queries across ${totalBatches} batches`
    );

    return batches;
}
