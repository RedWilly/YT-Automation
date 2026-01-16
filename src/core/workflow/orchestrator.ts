import type { ProgressTracker } from "../progress.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import type { WorkflowResult } from "../../types/index.ts";
import {
    type WorkflowState,
    type WorkflowStage,
    cacheInitStage,
    transcriptionStage,
    segmentationStage,
    imageQueriesStage,
    imageDownloadStage,
    videoGenStage,
    uploadStage,
} from "./stages/index.ts";
import * as logger from "../../utils/logger.ts";

const STAGES: WorkflowStage[] = [
    cacheInitStage,
    transcriptionStage,
    segmentationStage,
    imageQueriesStage,
    imageDownloadStage,
    videoGenStage,
    uploadStage,
];

export async function runCoreWorkflow(
    audioFilePath: string,
    progress: ProgressTracker,
    style: ResolvedStyle
): Promise<WorkflowResult> {
    logger.step("Workflow", `Using style: ${style.name} (${style.id})`);
    logger.debug("Workflow", `Segmentation: ${style.segmentationType}, Pan: ${style.panEffect}, Captions: ${style.captionsEnabled}`);

    let state: WorkflowState = {
        audioFilePath,
        progress,
        style,
    };

    for (const stage of STAGES) {
        state = await stage(state);
    }

    if (!state.result) {
        throw new Error("Workflow completed but no result was produced");
    }

    return state.result;
}
