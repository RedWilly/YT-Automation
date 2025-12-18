/**
 * FFmpeg utility functions for video processing
 * Supports configurable pan effects via style system
 * Supports both horizontal (16:9) and vertical (9:16 shorts) orientations
 */

import type { DownloadedImage, PanDirection, PanParams } from "../types/index.ts";
import type { VideoOrientation } from "../styles/types.ts";
import { DEFAULT_VIDEO_DIMENSIONS } from "../config/defaults.ts";
import * as logger from "./logger.ts";

// Video dimensions from config
const VIDEO_WIDTH_HORIZONTAL = DEFAULT_VIDEO_DIMENSIONS.horizontal.width;
const VIDEO_HEIGHT_HORIZONTAL = DEFAULT_VIDEO_DIMENSIONS.horizontal.height;
const VIDEO_WIDTH_VERTICAL = DEFAULT_VIDEO_DIMENSIONS.vertical.width;
const VIDEO_HEIGHT_VERTICAL = DEFAULT_VIDEO_DIMENSIONS.vertical.height;

/**
 * Get video dimensions based on orientation
 * @param orientation - Video orientation (horizontal or vertical)
 * @returns Object with width and height
 */
export function getVideoDimensions(orientation: VideoOrientation): { width: number; height: number } {
    if (orientation === "vertical") {
        return { width: VIDEO_WIDTH_VERTICAL, height: VIDEO_HEIGHT_VERTICAL };
    }
    return { width: VIDEO_WIDTH_HORIZONTAL, height: VIDEO_HEIGHT_HORIZONTAL };
}

/**
 * Calculate pan parameters based on image aspect ratio and orientation
 * - Horizontal video (16:9): vertical pan (up/down)
 * - Vertical video (9:16 shorts): horizontal pan (left/right)
 * - Scenes under 3 seconds: no pan (would look too fast/jarring)
 * 
 * @param duration - Scene duration in seconds
 * @param panEnabled - Whether pan effect is enabled
 * @param orientation - Video orientation
 * @returns Pan parameters for crop filter
 */
export function calculatePanParams(
    duration: number,
    panEnabled: boolean = true,
    orientation: VideoOrientation = "horizontal"
): PanParams {
    // Minimum duration for pan effect (3 seconds)
    // Panning on shorter segments looks jarring/too fast
    const MIN_PAN_DURATION = 3;

    // If pan effect is disabled or duration is too short, return disabled params
    if (!panEnabled || duration < MIN_PAN_DURATION) {
        return {
            enabled: false,
            direction: "down",
            yStart: 0,
            yEnd: 0,
            xStart: 0,
            xEnd: 0,
        };
    }

    const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = getVideoDimensions(orientation);

    // AI-generated image dimensions (4:3 aspect ratio from FLUX)
    const IMAGE_WIDTH = 1472;
    const IMAGE_HEIGHT = 1104;

    if (orientation === "vertical") {
        // VERTICAL (SHORTS): Horizontal pan (left/right)
        // Scale image to fit height, then pan horizontally
        const scaledWidth = (IMAGE_WIDTH * VIDEO_HEIGHT) / IMAGE_HEIGHT;
        const totalHeadroom = scaledWidth - VIDEO_WIDTH;
        const usableHeadroom = totalHeadroom * 0.30;
        const bufferZone = (totalHeadroom - usableHeadroom) / 2;

        // Randomly choose pan direction (left or right)
        const direction: PanDirection = Math.random() > 0.5 ? "right" : "left";

        let xStart: number;
        let xEnd: number;

        if (direction === "right") {
            xStart = bufferZone;
            xEnd = bufferZone + usableHeadroom;
        } else {
            xStart = bufferZone + usableHeadroom;
            xEnd = bufferZone;
        }

        return {
            enabled: true,
            direction,
            yStart: 0,
            yEnd: 0,
            xStart: Math.round(xStart),
            xEnd: Math.round(xEnd),
        };
    } else {
        // HORIZONTAL: Vertical pan (up/down)
        // Scale image to fit width, then pan vertically
        const scaledHeight = (IMAGE_HEIGHT * VIDEO_WIDTH) / IMAGE_WIDTH;
        const totalHeadroom = scaledHeight - VIDEO_HEIGHT;
        const usableHeadroom = totalHeadroom * 0.30;
        const bufferZone = (totalHeadroom - usableHeadroom) / 2;

        // Randomly choose pan direction (up or down)
        const direction: PanDirection = Math.random() > 0.5 ? "down" : "up";

        let yStart: number;
        let yEnd: number;

        if (direction === "down") {
            yStart = bufferZone;
            yEnd = bufferZone + usableHeadroom;
        } else {
            yStart = bufferZone + usableHeadroom;
            yEnd = bufferZone;
        }

        return {
            enabled: true,
            direction,
            yStart: Math.round(yStart),
            yEnd: Math.round(yEnd),
            xStart: 0,
            xEnd: 0,
        };
    }
}

/**
 * Create FFmpeg filter complex for image transitions
 * 
 * Images generated at the appropriate resolution:
 * - Panning scenes (≥3s): 4:3 aspect ratio for pan headroom
 * - Static scenes (<3s): Native video resolution (16:9 or 9:16)
 * 
 * This means static images don't need cropping - they already fit perfectly.
 * 
 * @param images - Sorted array of images with timing
 * @param panEnabled - Whether pan effect is enabled (from style config)
 * @param orientation - Video orientation (horizontal or vertical)
 * @returns Filter complex string and total duration
 */
export function createFilterComplex(
    images: DownloadedImage[],
    panEnabled: boolean = true,
    orientation: VideoOrientation = "horizontal"
): { filterComplex: string; totalDuration: number } {
    const filters: string[] = [];
    let totalDuration = 0;

    const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = getVideoDimensions(orientation);
    const imagesLength = images.length;

    // Process each image with optional pan effect
    for (let i = 0; i < imagesLength; i++) {
        const image = images[i];
        if (!image) continue;

        const duration = (image.end - image.start) / 1000;
        totalDuration += duration;

        const panParams = calculatePanParams(duration, panEnabled, orientation);

        if (panParams.enabled) {
            // PANNING: Image is 4:3, needs scaling and animated crop
            const fps = 30;
            const totalFrames = Math.round(duration * fps);

            if (orientation === "vertical") {
                // VERTICAL: Scale to fit height, horizontal pan
                const xExpression = `if(lte(n,${totalFrames}),${panParams.xStart}+(${panParams.xEnd}-${panParams.xStart})*n/${totalFrames},${panParams.xEnd})`;

                filters.push(
                    `[${i}:v]scale=-1:${VIDEO_HEIGHT},fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x='${xExpression}':y=0,setsar=1,format=yuv420p[v${i}]`
                );

                logger.debug("Video", `Image ${i + 1}: Pan ${panParams.direction} (X: ${panParams.xStart}px → ${panParams.xEnd}px) [shorts]`);
            } else {
                // HORIZONTAL: Scale to fit width, vertical pan
                const yExpression = `if(lte(n,${totalFrames}),${panParams.yStart}+(${panParams.yEnd}-${panParams.yStart})*n/${totalFrames},${panParams.yEnd})`;

                filters.push(
                    `[${i}:v]scale=${VIDEO_WIDTH}:-1,fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x=0:y='${yExpression}',setsar=1,format=yuv420p[v${i}]`
                );

                logger.debug("Video", `Image ${i + 1}: Pan ${panParams.direction} (Y: ${panParams.yStart}px → ${panParams.yEnd}px)`);
            }
        } else {
            // STATIC: Image is already at native video resolution (16:9 or 9:16)
            // Simple scale to exact dimensions - no cropping needed
            filters.push(
                `[${i}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,format=yuv420p[v${i}]`
            );
            logger.debug("Video", `Image ${i + 1}: Static (native resolution)`);
        }
    }

    // Concatenate all video segments
    const concatInputs = Array.from({ length: imagesLength }, (_, i) => `[v${i}]`).join("");
    filters.push(`${concatInputs}concat=n=${imagesLength}:v=1:a=0[outv]`);

    const filterComplex = filters.join(";");

    return { filterComplex, totalDuration };
}
