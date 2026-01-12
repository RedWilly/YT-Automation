/**
 * Stage 0: Cache Initialization
 * Hashes audio file and initializes cache entry
 */

import path from "node:path";
import type { WorkflowState } from "./types.ts";
import { hashAudioFile, updateAudioCache } from "../../../services/storage/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function cacheInitStage(state: WorkflowState): Promise<WorkflowState> {
    await state.progress.update({
        step: "Initializing",
        message: "Checking cache and preparing workflow...",
    });

    const audioHash = await hashAudioFile(state.audioFilePath);
    const filename = path.basename(state.audioFilePath);

    updateAudioCache(audioHash, {
        audio_filename: filename,
        audio_path: state.audioFilePath,
    });

    logger.step("Workflow", `Cache initialized for: ${filename}`);

    return {
        ...state,
        audioHash,
        filename,
    };
}
