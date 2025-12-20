/**
 * Pan effect - vertical pan (up/down) for horizontal video
 *              horizontal pan (left/right) for vertical video
 * 
 * Uses 4:3 aspect ratio images for headroom, then crops to output size
 * with animated position to create smooth panning motion.
 */

import type { VideoOrientation } from "../../../../styles/types.ts";
import type { PanDirection, PanParams } from "../../../../types/index.ts";
import { getVideoDimensions } from "../dimensions.ts";

/** Minimum duration (seconds) for pan effect - shorter scenes use static */
const MIN_PAN_DURATION = 3;

/** AI-generated image dimensions (4:3 aspect ratio for pan headroom) */
const IMAGE_WIDTH = 1472;
const IMAGE_HEIGHT = 1104;

/** Percentage of headroom to use for panning (30% of available) */
const USABLE_HEADROOM_PERCENT = 0.30;

/**
 * Calculate pan parameters based on duration and orientation
 * 
 * @param duration - Scene duration in seconds
 * @param orientation - Video orientation (horizontal or vertical)
 * @returns Pan parameters with direction and positions
 */
export function calculatePanParams(
    duration: number,
    orientation: VideoOrientation = "horizontal"
): PanParams {
    // Too short for pan - would look jarring
    if (duration < MIN_PAN_DURATION) {
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

    if (orientation === "vertical") {
        // VERTICAL VIDEO: Horizontal pan (left/right)
        const scaledWidth = (IMAGE_WIDTH * VIDEO_HEIGHT) / IMAGE_HEIGHT;
        const totalHeadroom = scaledWidth - VIDEO_WIDTH;
        const usableHeadroom = totalHeadroom * USABLE_HEADROOM_PERCENT;
        const bufferZone = (totalHeadroom - usableHeadroom) / 2;

        // Random direction
        const direction: PanDirection = Math.random() > 0.5 ? "right" : "left";

        const xStart = direction === "right" ? bufferZone : bufferZone + usableHeadroom;
        const xEnd = direction === "right" ? bufferZone + usableHeadroom : bufferZone;

        return {
            enabled: true,
            direction,
            yStart: 0,
            yEnd: 0,
            xStart: Math.round(xStart),
            xEnd: Math.round(xEnd),
        };
    } else {
        // HORIZONTAL VIDEO: Vertical pan (up/down)
        const scaledHeight = (IMAGE_HEIGHT * VIDEO_WIDTH) / IMAGE_WIDTH;
        const totalHeadroom = scaledHeight - VIDEO_HEIGHT;
        const usableHeadroom = totalHeadroom * USABLE_HEADROOM_PERCENT;
        const bufferZone = (totalHeadroom - usableHeadroom) / 2;

        // Random direction
        const direction: PanDirection = Math.random() > 0.5 ? "down" : "up";

        const yStart = direction === "down" ? bufferZone : bufferZone + usableHeadroom;
        const yEnd = direction === "down" ? bufferZone + usableHeadroom : bufferZone;

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
 * Create FFmpeg filter for pan effect
 * 
 * @param inputLabel - FFmpeg input label (e.g., "0:v")
 * @param outputLabel - FFmpeg output label (e.g., "v0")
 * @param duration - Scene duration in seconds
 * @param orientation - Video orientation
 * @returns FFmpeg filter string and whether pan is enabled
 * 
 * @example
 * // Horizontal video with vertical pan:
 * // "[0:v]scale=1920:-1,fps=30,crop=w=1920:h=1080:x=0:y='...',setsar=1,format=yuv420p[v0]"
 */
export function createPanFilter(
    inputLabel: string,
    outputLabel: string,
    duration: number,
    orientation: VideoOrientation
): { filter: string; enabled: boolean; direction?: PanDirection } {
    const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = getVideoDimensions(orientation);
    const params = calculatePanParams(duration, orientation);

    if (!params.enabled) {
        // Fall back to static
        return {
            filter: `[${inputLabel}]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,format=yuv420p[${outputLabel}]`,
            enabled: false,
        };
    }

    const fps = 30;
    const totalFrames = Math.round(duration * fps);

    if (orientation === "vertical") {
        // Horizontal pan (left/right)
        const xExpr = `if(lte(n,${totalFrames}),${params.xStart}+(${params.xEnd}-${params.xStart})*n/${totalFrames},${params.xEnd})`;

        return {
            filter: `[${inputLabel}]scale=-1:${VIDEO_HEIGHT},fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x='${xExpr}':y=0,setsar=1,format=yuv420p[${outputLabel}]`,
            enabled: true,
            direction: params.direction,
        };
    } else {
        // Vertical pan (up/down)
        const yExpr = `if(lte(n,${totalFrames}),${params.yStart}+(${params.yEnd}-${params.yStart})*n/${totalFrames},${params.yEnd})`;

        return {
            filter: `[${inputLabel}]scale=${VIDEO_WIDTH}:-1,fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x=0:y='${yExpr}',setsar=1,format=yuv420p[${outputLabel}]`,
            enabled: true,
            direction: params.direction,
        };
    }
}
