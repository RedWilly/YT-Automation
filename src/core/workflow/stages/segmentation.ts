/**
 * Stage 3: Segmentation
 * Processes transcript into segments based on style configuration
 */

import type { WorkflowState } from "./types.ts";
import { processTranscript } from "../../../services/transcription/index.ts";
import { getCachedSegments, setJobCache, type JobKey } from "../../../services/storage/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function segmentationStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.audioHash || !state.transcriptWords) {
        throw new Error("segmentationStage requires audioHash and transcriptWords from previous stages");
    }

    const jobKey: JobKey = {
        audioHash: state.audioHash,
        styleId: state.style.id,
        orientation: state.style.orientation,
        naturalEdit: state.style.segmentationType === "sentence",
    };

    const cachedSegments = getCachedSegments(jobKey);

    if (cachedSegments) {
        logger.log("Workflow", "📦 Using cached segments");
        return {
            ...state,
            segments: cachedSegments.segments,
            formattedTranscript: cachedSegments.formattedTranscript,
        };
    }

    await state.progress.update({
        step: "Processing Transcript",
        message: `Segmenting transcript (${state.style.segmentationType} mode)...`,
    });

    const result = processTranscript(state.transcriptWords, state.audioDuration ?? null, state.style);
    const segments = result.segments;

    const formattedTranscript = segments
        .map(seg => `[${seg.start}–${seg.end}ms]: ${seg.text}`)
        .join("\n");

    setJobCache(jobKey, {
        segments: JSON.stringify(segments),
        formatted_transcript: formattedTranscript,
    });

    logger.step("Workflow", `Created ${segments.length} segments`);

    return { ...state, segments, formattedTranscript };
}
