/**
 * FFmpeg filter complex builder
 * Orchestrates individual effects (pan, zoom, static) into a complete filter chain
 */

import type { DownloadedImage, ShotType } from "../../../types/index.ts";
import type { VideoOrientation } from "../../../styles/types.ts";
import { getVideoDimensions } from "./dimensions.ts";
import { createPanFilter } from "./effects/pan.ts";
import { createZoomFilter } from "./effects/zoom.ts";
import { createStaticFilter } from "./effects/static.ts";
import type { EffectType } from "./effects/index.ts";
import * as logger from "../../../utils/logger.ts";

/**
 * Determine which effect to apply based on shot type and settings
 * 
 * @param shotType - Shot type from LLM (pan/zoom/static)
 * @param panEnabled - Global pan effect setting from style
 * @param naturalEdit - Whether natural editing is enabled
 * @returns Effect type to apply
 */
export function determineEffectType(
    shotType: ShotType | undefined,
    panEnabled: boolean,
    naturalEdit: boolean
): EffectType {
    // Use shot type when naturalEdit is enabled
    if (naturalEdit && shotType) {
        return shotType;
    }
    // Fallback to global panEnabled setting
    return panEnabled ? "pan" : "static";
}

/**
 * Create FFmpeg filter complex for image transitions
 * 
 * Routes each image to the appropriate effect (pan, zoom, static)
 * based on shot type and style settings.
 * 
 * @param images - Sorted array of images with timing and shot type
 * @param panEnabled - Whether pan effect is enabled (from style)
 * @param orientation - Video orientation (horizontal or vertical)
 * @param naturalEdit - Whether natural editing is enabled
 * @returns Filter complex string and total duration
 */
export function createFilterComplex(
    images: DownloadedImage[],
    panEnabled: boolean = true,
    orientation: VideoOrientation = "horizontal",
    naturalEdit: boolean = false
): { filterComplex: string; totalDuration: number } {
    const filters: string[] = [];
    let totalDuration = 0;

    const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = getVideoDimensions(orientation);
    const imagesLength = images.length;

    for (let i = 0; i < imagesLength; i++) {
        const image = images[i];
        if (!image) continue;

        const duration = (image.end - image.start) / 1000;
        totalDuration += duration;

        const effectType = determineEffectType(image.type, panEnabled, naturalEdit);
        const inputLabel = `${i}:v`;
        const outputLabel = `v${i}`;

        if (effectType === "pan") {
            const result = createPanFilter(inputLabel, outputLabel, duration, orientation);
            filters.push(result.filter);

            if (result.enabled) {
                logger.debug("Video", `Image ${i + 1}: Pan ${result.direction} [${image.type ?? "global"}]`);
            } else {
                logger.debug("Video", `Image ${i + 1}: Static (duration too short for pan)`);
            }

        } else if (effectType === "zoom") {
            const result = createZoomFilter(inputLabel, outputLabel, duration, orientation);
            filters.push(result.filter);

            if (result.enabled) {
                logger.debug("Video", `Image ${i + 1}: Zoom ${result.zoomIn ? "in" : "out"} [${image.type ?? "zoom"}]`);
            } else {
                logger.debug("Video", `Image ${i + 1}: Static (duration too short for zoom)`);
            }

        } else {
            // Static
            filters.push(createStaticFilter(inputLabel, outputLabel, orientation));
            logger.debug("Video", `Image ${i + 1}: Static [${image.type ?? "default"}]`);
        }
    }

    // Concatenate all video segments
    const concatInputs = Array.from({ length: imagesLength }, (_, i) => `[v${i}]`).join("");
    filters.push(`${concatInputs}concat=n=${imagesLength}:v=1:a=0[outv]`);

    return {
        filterComplex: filters.join(";"),
        totalDuration,
    };
}
