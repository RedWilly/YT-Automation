/**
 * Stage 7: Upload to MinIO
 * Uploads final video to object storage (optional, based on config)
 */

import type { WorkflowState } from "./types.ts";
import { MINIO } from "../../../config/index.ts";
import { uploadVideoToMinIO } from "../../../services/storage/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function uploadStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.result) {
        throw new Error("uploadStage requires result from video-gen stage");
    }

    if (!MINIO.enabled) {
        logger.log("Workflow", "MinIO upload disabled, skipping");
        return state;
    }

    await state.progress.update({
        step: "Uploading to MinIO",
        message: "Uploading video to MinIO object storage...",
    });

    const minioResult = await uploadVideoToMinIO(state.result.videoPath);

    if (minioResult.success) {
        logger.success("Workflow", `Video uploaded to MinIO: ${minioResult.url}`);

        return {
            ...state,
            result: {
                ...state.result,
                minioUpload: minioResult,
            },
        };
    }

    logger.warn("Workflow", `MinIO upload failed: ${minioResult.error}`);
    return state;
}
