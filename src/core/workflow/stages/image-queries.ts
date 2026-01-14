/**
 * Stage 4: Image Query Generation
 * Uses LLM to generate visual scene descriptions for each segment
 */

import type { WorkflowState } from "./types.ts";
import { generateImageQueries, type StoryContext } from "../../../services/llm/index.ts";
import {
    getCachedImageQueries,
    getCachedStoryContext,
    updateStyleCache,
} from "../../../services/storage/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function imageQueriesStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.audioHash || !state.segments || !state.formattedTranscript) {
        throw new Error("imageQueriesStage requires audioHash, segments, and formattedTranscript");
    }

    const useSentenceSegmentation = state.style.segmentationType === "sentence";

    const cachedQueries = getCachedImageQueries(
        state.audioHash,
        state.style.id,
        state.style.orientation,
        useSentenceSegmentation
    );
    const cachedContext = getCachedStoryContext(
        state.audioHash,
        state.style.id,
        state.style.orientation,
        useSentenceSegmentation
    ) as StoryContext | null;

    if (cachedQueries) {
        logger.log("Workflow", "📦 Using cached image queries (skipping LLM API call)");

        validateQueryCount(cachedQueries.length, state.segments.length);
        validateTimestamps(cachedQueries, state.segments);

        // Note: structuredShots not available from cache, will regenerate seeds
        return {
            ...state,
            imageQueries: cachedQueries,
            structuredShots: undefined, // Will use fallback random seeds
            storyContext: cachedContext,
        };
    }

    await state.progress.update({
        step: "Generating Image Queries",
        message: "Using AI to generate visual scene descriptions...",
    });

    const result = await generateImageQueries(
        state.formattedTranscript,
        state.style,
        cachedContext,
        (context) => {
            if (context.entities.length > 0 || context.scenes.length > 0) {
                updateStyleCache(state.audioHash!, state.style.id, state.style.orientation, useSentenceSegmentation, {
                    story_context: JSON.stringify(context),
                });
                logger.log("Workflow", "📦 Cached story context immediately after extraction");
            } else {
                logger.log("Workflow", "⚠️ No entities/scenes extracted, skipping context cache");
            }
        }
    );

    const imageQueries = result.queries;

    updateStyleCache(state.audioHash, state.style.id, state.style.orientation, useSentenceSegmentation, {
        image_queries: JSON.stringify(imageQueries),
    });

    validateQueryCount(imageQueries.length, state.segments.length);
    validateTimestamps(imageQueries, state.segments);

    logger.step("Workflow", `Generated ${imageQueries.length} image queries and cached`);

    return {
        ...state,
        imageQueries,
        structuredShots: result.structuredShots,
        storyContext: result.storyContext,
    };
}

function validateQueryCount(queryCount: number, segmentCount: number): void {
    if (queryCount !== segmentCount) {
        throw new Error(
            `Mismatch: Expected ${segmentCount} queries (one per segment), but got ${queryCount} queries from LLM`
        );
    }
    logger.success("Workflow", `Query count matches segment count (${segmentCount})`);
}

function validateTimestamps(
    queries: { start: number; end: number }[],
    segments: { start: number; end: number }[]
): void {
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const query = queries[i];
        if (!segment || !query) continue;

        if (query.start !== segment.start || query.end !== segment.end) {
            logger.warn(
                "Workflow",
                `Timestamp mismatch at segment ${i + 1}: ` +
                `Expected [${segment.start}-${segment.end}ms], ` +
                `Got [${query.start}-${query.end}ms]`
            );
        }
    }
}
