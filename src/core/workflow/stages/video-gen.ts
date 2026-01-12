/**
 * Stage 6: Video Generation
 * Creates final video using FFmpeg
 */

import path from "node:path";
import type { WorkflowState } from "./types.ts";
import { generateVideo, validateVideoInputs } from "../../../services/video/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function videoGenStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.downloadedImages || !state.transcriptWords || !state.segments) {
        throw new Error("videoGenStage requires downloadedImages, transcriptWords, and segments");
    }

    await state.progress.update({
        step: "Generating Video",
        message: "Creating video with FFmpeg...\nThis may take a few minutes for long videos.",
    });

    validateVideoInputs(state.downloadedImages, state.audioFilePath);

    const outputFileName = path.parse(state.audioFilePath).name;
    const videoResult = await generateVideo(
        state.downloadedImages,
        state.audioFilePath,
        state.transcriptWords,
        state.segments,
        outputFileName,
        state.style
    );

    logger.step("Workflow", "Video created", videoResult.videoPath);

    return {
        ...state,
        result: {
            videoPath: videoResult.videoPath,
            duration: videoResult.duration,
        },
    };
}
