/**
 * Stage 5: Image Download
 * Downloads or generates images for each segment
 * Uses per-segment caching for incremental progress
 */

import type { WorkflowState } from "./types.ts";
import { downloadImagesForQueries, validateDownloadedImages } from "../../../services/image/index.ts";
import {
    getDownloadedImages,
    getCachedImagesForResume,
    getResumeState,
    updateSegmentStatus,
    updateSegmentRewrite,
    type JobKey,
    type SegmentKey,
} from "../../../services/storage/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function imageDownloadStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.audioHash || !state.imageQueries) {
        throw new Error("imageDownloadStage requires audioHash and imageQueries");
    }

    const jobKey: JobKey = {
        audioHash: state.audioHash,
        styleId: state.style.id,
        orientation: state.style.orientation,
        naturalEdit: state.style.segmentationType === "sentence",
    };

    const totalSegments = state.imageQueries.length;
    const resumeState = getResumeState(jobKey);

    // Check if all images are already cached
    if (resumeState.isComplete) {
        const cachedImages = getDownloadedImages(jobKey);
        if (cachedImages && cachedImages.length === totalSegments) {
            logger.log("Workflow", "📦 Using cached images");
            return { ...state, downloadedImages: cachedImages };
        }
    }

    const existingCount = resumeState.completedCount;
    const remainingCount = totalSegments - existingCount;

    // Get cached images for resume (only images that exist on disk)
    const cachedImages = existingCount > 0 ? getCachedImagesForResume(jobKey) : [];

    await state.progress.update({
        step: "Downloading Images",
        message: existingCount > 0
            ? `Resuming: ${remainingCount} remaining of ${totalSegments}...`
            : `Generating ${totalSegments} images...`,
        current: existingCount,
        total: totalSegments,
    });

    // Helper to build segment key
    const segmentKey = (index: number): SegmentKey => ({ ...jobKey, segmentIndex: index });

    const downloadedImages = await downloadImagesForQueries(
        state.imageQueries,
        state.style,
        cachedImages.length > 0 ? cachedImages : undefined,  // Pass cached images for resume
        undefined,  // No legacy callback
        state.structuredShots,
        {
            onImageApproved: (segmentIndex, imagePath, seed) => {
                updateSegmentStatus(segmentKey(segmentIndex), 'approved', imagePath, seed);
            },
            onPromptRewritten: (segmentIndex, newPrompt, rewriteCount) => {
                updateSegmentRewrite(segmentKey(segmentIndex), newPrompt, rewriteCount);
            },
        }
    );

    validateDownloadedImages(downloadedImages);
    logger.step("Workflow", `Downloaded ${downloadedImages.length} images`);

    return { ...state, downloadedImages };
}
