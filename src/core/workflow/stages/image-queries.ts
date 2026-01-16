/**
 * Stage 4: Image Query Generation
 * Uses LLM to generate visual scene descriptions for each segment
 * Incremental per-segment caching for resilience
 * Supports resuming from partial completion
 */

import type { WorkflowState } from './types.ts';
import {
    generateImageQueries,
    type StoryContext,
    type GeneratorCacheConfig,
    type LLMResumeState,
} from '../../../services/llm/index.ts';
import {
    getImageQueries,
    getCachedStoryContext,
    setJobCache,
    getAllSegments,
    getLLMResumeState,
    type JobKey,
} from '../../../services/storage/index.ts';
import { getAIConfig } from '../../../config/index.ts';
import * as logger from '../../../utils/logger.ts';

export async function imageQueriesStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.audioHash || !state.segments || !state.formattedTranscript) {
        throw new Error('imageQueriesStage requires audioHash, segments, and formattedTranscript');
    }

    const jobKey: JobKey = {
        audioHash: state.audioHash,
        styleId: state.style.id,
        orientation: state.style.orientation,
        naturalEdit: state.style.segmentationType === 'sentence',
    };

    const cachedContext = getCachedStoryContext(jobKey) as StoryContext | null;
    const segments = getAllSegments(jobKey);
    const aiConfig = getAIConfig();
    const batchSize = aiConfig.segmentsPerBatch;

    // If we have all segments cached, reconstruct from them
    if (segments.length === state.segments.length) {
        logger.log('Workflow', '📦 Using cached segments');

        const imageQueries = segments.map(seg => {
            const shot = JSON.parse(seg.structured_shot);
            return { start: shot.start, end: shot.end, query: seg.current_prompt, type: shot.type };
        });
        const structuredShots = segments.map(seg => JSON.parse(seg.structured_shot));

        validateQueryCount(imageQueries.length, state.segments.length);

        return { ...state, imageQueries, structuredShots, storyContext: cachedContext };
    }

    // Check for PARTIAL completion (resume scenario)
    if (segments.length > 0 && segments.length < state.segments.length) {
        const resumeState = getLLMResumeState(jobKey, batchSize);

        logger.log(
            'Workflow',
            `📦 Resuming LLM generation from batch ${resumeState.resumeBatchIndex + 1} (${resumeState.cachedCount}/${state.segments.length} segments cached)`
        );

        // Reconstruct cached shots for pre-population
        const cachedShots = segments
            .sort((a, b) => a.segment_index - b.segment_index)
            .map(seg => JSON.parse(seg.structured_shot));

        await state.progress.update({
            step: 'Generating Image Queries',
            message: `Resuming from batch ${resumeState.resumeBatchIndex + 1}...`,
        });

        const cacheConfig: GeneratorCacheConfig = jobKey;
        const llmResumeState: LLMResumeState = {
            resumeBatchIndex: resumeState.resumeBatchIndex,
            lastQueries: resumeState.lastQueries,
            cachedShots,
        };

        const result = await generateImageQueries(
            state.formattedTranscript,
            state.style,
            cachedContext,
            (context) => {
                if (context.entities.length > 0 || context.scenes.length > 0) {
                    setJobCache(jobKey, { story_context: JSON.stringify(context) });
                    logger.log('Workflow', '📦 Cached story context');
                }
            },
            cacheConfig,
            undefined,
            llmResumeState
        );

        validateQueryCount(result.queries.length, state.segments.length);
        logger.step('Workflow', `Completed ${result.queries.length} image queries (resumed)`);

        return {
            ...state,
            imageQueries: result.queries,
            structuredShots: result.structuredShots,
            storyContext: result.storyContext,
        };
    }

    // Check legacy cache (getImageQueries reconstructs from segments, but also handles migration)
    const cachedQueries = getImageQueries(jobKey);
    if (cachedQueries && cachedQueries.length === state.segments.length) {
        logger.log('Workflow', '📦 Using cached image queries');
        validateQueryCount(cachedQueries.length, state.segments.length);
        return { ...state, imageQueries: cachedQueries, structuredShots: undefined, storyContext: cachedContext };
    }

    // Full generation from scratch
    await state.progress.update({
        step: 'Generating Image Queries',
        message: 'Using AI to generate visual scene descriptions...',
    });

    const cacheConfig: GeneratorCacheConfig = jobKey;

    const result = await generateImageQueries(
        state.formattedTranscript,
        state.style,
        cachedContext,
        (context) => {
            if (context.entities.length > 0 || context.scenes.length > 0) {
                setJobCache(jobKey, { story_context: JSON.stringify(context) });
                logger.log('Workflow', '📦 Cached story context');
            }
        },
        cacheConfig
    );

    validateQueryCount(result.queries.length, state.segments.length);
    logger.step('Workflow', `Generated ${result.queries.length} image queries`);

    return {
        ...state,
        imageQueries: result.queries,
        structuredShots: result.structuredShots,
        storyContext: result.storyContext,
    };
}

function validateQueryCount(queryCount: number, segmentCount: number): void {
    if (queryCount !== segmentCount) {
        throw new Error(`Mismatch: Expected ${segmentCount} queries, got ${queryCount}`);
    }
}

