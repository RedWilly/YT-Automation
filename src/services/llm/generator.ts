/**
 * Image Query Generator
 * Generates image search queries from transcripts using LLM
 * Supports natural editing mode with b-roll shot types
 */

import { AI_TEXT } from "../../config/environment.ts";
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
 * @returns Array of image search queries with timestamps (and shot types if naturalEdit)
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
    // Shot types only apply to sentence-based segmentation
    const useShotTypes = style.segmentationType === 'sentence';

    logger.step(
        "LLM",
        `Generating image search queries using ${AI_PROVIDER}`,
        `${segmentCount} segments, style: ${style.name}${useShotTypes ? " (with shot types)" : ""}`
    );

    // Build system prompt with style-specific context
    const systemPrompt = buildSystemPrompt(USE_AI_IMAGE, style);

    // Log image source
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

    // Log shot type mode
    if (useShotTypes) {
        logger.log(
            "LLM",
            `🎬 Shot type mode - LLM will assign types (static/pan/zoom)`
        );
    }

    // If small enough, single request
    const batchSize = LLM_SEGMENTS_PER_BATCH;
    if (segmentCount <= batchSize) {
        const userPrompt = buildUserPrompt(formattedTranscript, segmentCount, USE_AI_IMAGE, useShotTypes);
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

    // Batching path for large transcripts
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

        const userPrompt = buildUserPrompt(batchFormatted, expectedCount, USE_AI_IMAGE, useShotTypes);
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
