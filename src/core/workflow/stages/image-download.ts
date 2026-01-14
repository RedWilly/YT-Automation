/**
 * Stage 5: Image Download
 * Downloads or generates images for each segment query
 */

import type { WorkflowState } from "./types.ts";
import {
    downloadImagesForQueries,
    validateDownloadedImages,
} from "../../../services/image/index.ts";
import { getCachedImages, updateStyleCache } from "../../../services/storage/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function imageDownloadStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.audioHash || !state.imageQueries) {
        throw new Error("imageDownloadStage requires audioHash and imageQueries");
    }

    const useSentenceSegmentation = state.style.segmentationType === "sentence";

    const cachedImages = getCachedImages(
        state.audioHash,
        state.style.id,
        state.style.orientation,
        useSentenceSegmentation
    );

    if (cachedImages && cachedImages.length === state.imageQueries.length) {
        logger.log("Workflow", "📦 Using cached images (all files verified to exist)");

        return {
            ...state,
            downloadedImages: cachedImages,
        };
    }

    const existingCount = cachedImages?.length ?? 0;
    const remainingCount = state.imageQueries.length - existingCount;

    await state.progress.update({
        step: "Downloading Images",
        message: existingCount > 0
            ? `Resuming download: ${remainingCount} remaining of ${state.imageQueries.length} images...`
            : `Downloading ${state.imageQueries.length} images...`,
        current: existingCount,
        total: state.imageQueries.length,
    });

    const downloadedImages = await downloadImagesForQueries(
        state.imageQueries,
        state.style,
        cachedImages ?? undefined,
        (images) => {
            updateStyleCache(
                state.audioHash!,
                state.style.id,
                state.style.orientation,
                useSentenceSegmentation,
                { downloaded_images: JSON.stringify(images) }
            );
        },
        state.structuredShots
    );

    validateDownloadedImages(downloadedImages);

    updateStyleCache(
        state.audioHash,
        state.style.id,
        state.style.orientation,
        useSentenceSegmentation,
        {
            image_queries: JSON.stringify(state.imageQueries),
            downloaded_images: JSON.stringify(downloadedImages),
        }
    );

    logger.step("Workflow", `Downloaded ${downloadedImages.length} images and cached`);

    return {
        ...state,
        downloadedImages,
    };
}
