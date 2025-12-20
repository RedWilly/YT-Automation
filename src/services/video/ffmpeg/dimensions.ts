/**
 * Video dimensions and constants for FFmpeg processing
 * Supports horizontal (16:9) and vertical (9:16 shorts) orientations
 */

import type { VideoOrientation } from "../../../styles/types.ts";
import { DEFAULT_VIDEO_DIMENSIONS } from "../../../config/defaults.ts";

/** Horizontal video dimensions (16:9) */
const VIDEO_WIDTH_HORIZONTAL = DEFAULT_VIDEO_DIMENSIONS.horizontal.width;
const VIDEO_HEIGHT_HORIZONTAL = DEFAULT_VIDEO_DIMENSIONS.horizontal.height;

/** Vertical video dimensions (9:16 shorts) */
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
