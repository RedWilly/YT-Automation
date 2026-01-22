/** Context-aware image query generator with story context extraction and batch processing */

import { AI_TEXT, getAIConfig } from '../../config/index.ts';
import type { ImageSearchQuery } from '../../types/index.ts';
import type { ResolvedStyle } from '../../styles/types.ts';
import * as logger from '../../utils/logger.ts';
import {
    buildContextAwareSystemPrompt,
    buildContextAwareUserPrompt,
} from './prompts.ts';
import { callLLMWithRetry } from './client.ts';
import { parseStructuredShots, validateStructuredShots } from './parser.ts';
import { buildImagePrompt } from './shot-builder.ts';
import type { StructuredShot, StoryContext, BatchState } from '../../types/llm.ts';
import {
    extractStoryContext,
    createInitialBatchState,
    updateBatchState,
} from './context.ts';
import { upsertSegment, type SegmentKey } from '../storage/cache.ts';
import { generateConsistentSeed } from './shot-builder.ts';

// Get AI configuration
const aiConfig = getAIConfig();
const AI_PROVIDER = AI_TEXT.provider;
const LLM_SEGMENTS_PER_BATCH = aiConfig.segmentsPerBatch;
const LLM_MAX_RETRIES = aiConfig.maxRetries;
const USE_AI_IMAGE = AI_TEXT.useAiImage;

/** Cache key configuration for incremental per-segment caching */
export interface GeneratorCacheConfig {
    audioHash: string;
    styleId: string;
    orientation: string;
    naturalEdit: boolean;
}

/** Resume state for continuing from a previous partial run */
export interface LLMResumeState {
    resumeBatchIndex: number;
    lastQueries: string[];
    cachedShots: StructuredShot[];
}

/** Generate image search queries from formatted transcript using context-aware extraction */
export async function generateImageQueries(
    formattedTranscript: string,
    style: ResolvedStyle,
    cachedContext?: StoryContext | null,
    onContextExtracted?: (context: StoryContext) => void,
    cacheConfig?: GeneratorCacheConfig,
    onShotGenerated?: (index: number, shot: StructuredShot, prompt: string) => void,
    resumeState?: LLMResumeState
): Promise<{
    queries: ImageSearchQuery[];
    storyContext: StoryContext;
    structuredShots: StructuredShot[];
}> {
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

        // Call callback immediately after extraction
        onContextExtracted?.(storyContext);
    }

    logger.step('LLM', `📝 Phase 2: Generating queries with context injection`);

    const { queries, structuredShots } = await generateQueriesWithContext(
        lines,
        segmentCount,
        batchSize,
        style,
        useShotTypes,
        storyContext,
        cacheConfig,
        onShotGenerated,
        resumeState
    );
    return { queries, storyContext, structuredShots };
}

/** Generate queries with context injection for all segments */
async function generateQueriesWithContext(
    lines: string[],
    segmentCount: number,
    batchSize: number,
    style: ResolvedStyle,
    useShotTypes: boolean,
    storyContext: StoryContext,
    cacheConfig?: GeneratorCacheConfig,
    onShotGenerated?: (index: number, shot: StructuredShot, prompt: string) => void,
    resumeState?: LLMResumeState
): Promise<{ queries: ImageSearchQuery[]; structuredShots: StructuredShot[] }> {
    // If resuming, pre-populate with cached shots
    const allStructuredShots: StructuredShot[] = resumeState?.cachedShots ? [...resumeState.cachedShots] : [];

    // Determine if we need batching
    const shouldBatch = batchSize > 0 && segmentCount > batchSize;
    const totalBatches = shouldBatch ? Math.ceil(segmentCount / batchSize) : 1;

    // Initialize batch state with resume data if available
    let batchState = createInitialBatchState();
    const startBatch = resumeState?.resumeBatchIndex ?? 0;

    if (resumeState && resumeState.lastQueries.length > 0) {
        batchState = {
            ...batchState,
            batchIndex: startBatch,
            lastQueries: resumeState.lastQueries,
        };
        logger.log('LLM', `📦 Resuming from batch ${startBatch + 1}/${totalBatches} with ${resumeState.lastQueries.length} context queries`);
    }

    for (let batchIndex = startBatch; batchIndex < totalBatches; batchIndex++) {
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

        // Build context-aware prompts with explicit segment indexing
        const systemPrompt = buildContextAwareSystemPrompt(USE_AI_IMAGE, style, storyContext);
        const userPrompt = buildContextAwareUserPrompt(
            batchFormatted,
            expectedCount,
            useShotTypes,
            storyContext,
            batchState,
            [start, end - 1],
            segmentCount  // Pass total segments for global index context
        );

        const label = shouldBatch ? ` (batch ${batchIndex + 1})` : '';
        let batchShots: StructuredShot[] = [];
        let retryAttempt = 0;
        const maxBatchRetries = LLM_MAX_RETRIES;

        while (retryAttempt <= maxBatchRetries) {
            const rawResponse = await callLLMWithRetry(
                systemPrompt,
                userPrompt,
                label,
                1,
                true // Return raw response for structured shot parsing
            );

            // Log raw response for debugging/verification
            // logger.log('LLM', `Batch ${batchIndex + 1} raw response: ${rawResponse}`);

            try {
                // Parse LLM response as StructuredShot[]
                batchShots = parseStructuredShots(rawResponse);

                if (batchShots.length === expectedCount) {
                    break;
                }

                if (retryAttempt < maxBatchRetries) {
                    logger.warn(
                        'LLM',
                        `Expected ${expectedCount} shots, got ${batchShots.length}. Retrying${label} (attempt ${retryAttempt + 2}/${maxBatchRetries + 1})...`
                    );
                    retryAttempt++;
                } else {
                    logger.warn(
                        'LLM',
                        `Expected ${expectedCount} shots, got ${batchShots.length} after ${maxBatchRetries + 1} attempts${label}. Proceeding with partial results.`
                    );
                    break;
                }
            } catch (error) {
                if (retryAttempt < maxBatchRetries) {
                    logger.warn(
                        'LLM',
                        `Schema validation failed: ${error instanceof Error ? error.message : String(error)}. Retrying${label} (attempt ${retryAttempt + 2}/${maxBatchRetries + 1})...`
                    );
                    retryAttempt++;
                } else {
                    logger.error(
                        'LLM',
                        `Schema validation failed after ${maxBatchRetries + 1} attempts${label}: ${error instanceof Error ? error.message : String(error)}`
                    );
                    break;
                }
            }
        }

        // Validate structured shots
        validateStructuredShots(batchShots);

        // INCREMENTAL CACHING: Cache each shot immediately after successful parse
        for (let i = 0; i < batchShots.length; i++) {
            const shot = batchShots[i];
            if (!shot) continue;

            const globalIndex = start + i + 1;  // 1-based segment index
            const prompt = buildImagePrompt(shot, storyContext, style);
            const seed = generateConsistentSeed(shot, start + i);

            if (cacheConfig) {
                const key: SegmentKey = { ...cacheConfig, segmentIndex: globalIndex };
                upsertSegment(key, {
                    totalSegments: segmentCount,
                    originalPrompt: prompt,
                    currentPrompt: prompt,
                    structuredShot: JSON.stringify(shot),
                    seed,
                });
            }

            onShotGenerated?.(globalIndex, shot, prompt);
        }

        allStructuredShots.push(...batchShots);

        // Update batch state for next iteration
        const activeEntities = batchShots.flatMap(s => [...s.focus.emphasis]);
        const currentScene = findCurrentScene(end - 1, storyContext);
        const currentMood = currentScene?.mood || batchState.currentMood;

        batchState = updateBatchState(
            batchState,
            batchShots.map(s => s.action),
            [...new Set(activeEntities)],
            currentScene?.id || '',
            currentMood
        );

        if (cacheConfig && shouldBatch) {
            logger.log('Cache', `📦 Cached ${batchShots.length} segment prompts (batch ${batchIndex + 1}/${totalBatches})`);
        }
    }

    const queries = allStructuredShots.map((shot, i) => ({
        start: shot.start,
        end: shot.end,
        query: buildImagePrompt(shot, storyContext, style),
        type: shot.type,
    }));

    logger.success(
        'LLM',
        `Generated ${queries.length} image search queries${totalBatches > 1 ? ` across ${totalBatches} batches` : ''}`
    );

    return { queries, structuredShots: allStructuredShots };
}

/** Find which scene contains a given segment index */
function findCurrentScene(segmentIndex: number, context: StoryContext) {
    for (const scene of context.scenes) {
        const [sceneStart, sceneEnd] = scene.segmentRange;
        if (segmentIndex >= sceneStart && segmentIndex <= sceneEnd) {
            return scene;
        }
    }
    return null;
}
