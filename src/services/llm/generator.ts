/**
 * Image Query Generator
 * Two-phase workflow for context-aware query generation:
 * Phase 1: Extract story context (entities, scenes) from full transcript
 * Phase 2: Generate queries in batches with context injection
 */

import { AI_TEXT, getAIConfig } from '../../config/environment.ts';
import type { ImageSearchQuery } from '../../types/index.ts';
import type { ResolvedStyle } from '../../styles/types.ts';
import * as logger from '../../utils/logger.ts';
import {
    buildContextAwareSystemPrompt,
    buildContextAwareUserPrompt,
} from './prompts.ts';
import { callLLMWithRetry } from './client.ts';
import { validateImageQueries } from './parser.ts';
import {
    extractStoryContext,
    createInitialBatchState,
    updateBatchState,
    type StoryContext,
    type BatchState,
} from './context.ts';

// Get AI configuration
const aiConfig = getAIConfig();
const AI_PROVIDER = AI_TEXT.provider;
const LLM_SEGMENTS_PER_BATCH = aiConfig.segmentsPerBatch;
const LLM_MAX_RETRIES = aiConfig.maxRetries;
const USE_AI_IMAGE = AI_TEXT.useAiImage;

/**
 * Generate image search queries from formatted transcript
 * Always uses two-phase context-aware generation
 * 
 * @param formattedTranscript - Formatted transcript with timestamps
 * @param style - Resolved style configuration for style-specific prompts
 * @param cachedContext - Optional cached StoryContext to skip extraction
 * @returns Object with queries and storyContext (for caching)
 */
export async function generateImageQueries(
    formattedTranscript: string,
    style: ResolvedStyle,
    cachedContext?: StoryContext | null
): Promise<{ queries: ImageSearchQuery[]; storyContext: StoryContext }> {
    const lines = formattedTranscript
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const segmentCount = lines.length;
    const useShotTypes = style.segmentationType === 'sentence';
    const batchSize = LLM_SEGMENTS_PER_BATCH;

    logger.step(
        'LLM',
        `Generating image search queries using ${AI_PROVIDER}`,
        `${segmentCount} segments, style: ${style.name}${useShotTypes ? ' (with shot types)' : ''}`
    );

    if (USE_AI_IMAGE) {
        logger.log(
            'LLM',
            `🎨 AI image generation enabled - style: "${style.imageStyle.substring(0, 50)}..."`
        );
    } else {
        logger.log(
            'LLM',
            `🔍 Web image search enabled - optimizing queries for search results`
        );
    }

    if (useShotTypes) {
        logger.log(
            'LLM',
            `🎬 Shot type mode - LLM will assign types (static/pan/zoom)`
        );
    }

    // =========================================================================
    // PHASE 1: Extract story context (or use cached)
    // =========================================================================
    let storyContext: StoryContext;

    if (cachedContext) {
        logger.log('Context', '📦 Using cached story context');
        storyContext = cachedContext;
    } else {
        logger.step('LLM', '📚 Phase 1: Extracting story context from full transcript');
        storyContext = await extractStoryContext(formattedTranscript, segmentCount);
        logger.success(
            'Context',
            `Extracted ${storyContext.entities.length} entities, ${storyContext.scenes.length} scenes`
        );
    }

    // =========================================================================
    // PHASE 2: Generate queries with context
    // =========================================================================
    logger.step('LLM', `📝 Phase 2: Generating queries with context injection`);

    const queries = await generateQueriesWithContext(
        lines,
        segmentCount,
        batchSize,
        style,
        useShotTypes,
        storyContext
    );

    return { queries, storyContext };
}

/**
 * Generate queries with context injection
 * Uses context-aware prompts for all segments
 */
async function generateQueriesWithContext(
    lines: string[],
    segmentCount: number,
    batchSize: number,
    style: ResolvedStyle,
    useShotTypes: boolean,
    storyContext: StoryContext
): Promise<ImageSearchQuery[]> {
    const allQueries: ImageSearchQuery[] = [];

    // Determine if we need batching
    const shouldBatch = batchSize > 0 && segmentCount > batchSize;
    const totalBatches = shouldBatch ? Math.ceil(segmentCount / batchSize) : 1;

    let batchState = createInitialBatchState();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = shouldBatch ? batchIndex * batchSize : 0;
        const end = shouldBatch ? Math.min(start + batchSize, segmentCount) : segmentCount;
        const batchLines = lines.slice(start, end);
        const batchFormatted = batchLines.join('\n');
        const expectedCount = batchLines.length;

        if (shouldBatch) {
            logger.step(
                'LLM',
                `Processing batch ${batchIndex + 1}/${totalBatches}`,
                `Segments ${start + 1}-${end}`
            );
        }

        // Build context-aware prompts
        const systemPrompt = buildContextAwareSystemPrompt(USE_AI_IMAGE, style, storyContext);
        const userPrompt = buildContextAwareUserPrompt(
            batchFormatted,
            expectedCount,
            USE_AI_IMAGE,
            useShotTypes,
            storyContext,
            batchState,
            [start, end - 1]
        );

        const label = shouldBatch ? ` (batch ${batchIndex + 1})` : '';
        let queries: ImageSearchQuery[] = [];
        let retryAttempt = 0;
        const maxBatchRetries = LLM_MAX_RETRIES;

        while (retryAttempt <= maxBatchRetries) {
            queries = await callLLMWithRetry(
                systemPrompt,
                userPrompt,
                label,
                1
            );

            if (queries.length === expectedCount) {
                break;
            }
            if (retryAttempt < maxBatchRetries) {
                logger.warn(
                    'LLM',
                    `Expected ${expectedCount} queries, got ${queries.length}. Retrying${label} (attempt ${retryAttempt + 2}/${maxBatchRetries + 1})...`
                );
                retryAttempt++;
            } else {
                logger.warn(
                    'LLM',
                    `Expected ${expectedCount} queries, got ${queries.length} after ${maxBatchRetries + 1} attempts${label}. Proceeding with partial results.`
                );
                break;
            }
        }

        validateImageQueries(queries);
        allQueries.push(...queries);

        // Update batch state for next iteration
        const queryStrings = queries.map(q => q.query);
        const activeEntities = findActiveEntities(queries, storyContext);
        const currentScene = findCurrentScene(end - 1, storyContext);
        const currentMood = currentScene?.mood || batchState.currentMood;

        batchState = updateBatchState(
            batchState,
            queryStrings,
            activeEntities,
            currentScene?.id || '',
            currentMood
        );
    }

    logger.success(
        'LLM',
        `Generated ${allQueries.length} image search queries${totalBatches > 1 ? ` across ${totalBatches} batches` : ''}`
    );

    return allQueries;
}

/**
 * Find which entities are likely referenced in the queries
 */
function findActiveEntities(queries: ImageSearchQuery[], context: StoryContext): string[] {
    const active: string[] = [];
    const queryText = queries.map(q => q.query.toLowerCase()).join(' ');

    for (const entity of context.entities) {
        // Check if entity name or parts of description appear in queries
        const nameLower = entity.name.toLowerCase();
        const descWords = entity.description.toLowerCase().split(' ').slice(0, 5);

        if (queryText.includes(nameLower) || descWords.some(w => queryText.includes(w))) {
            active.push(entity.id);
        }
    }

    return active;
}

/**
 * Find which scene contains a given segment index
 */
function findCurrentScene(segmentIndex: number, context: StoryContext) {
    for (const scene of context.scenes) {
        const [sceneStart, sceneEnd] = scene.segmentRange;
        if (segmentIndex >= sceneStart && segmentIndex <= sceneEnd) {
            return scene;
        }
    }
    return null;
}
