/**
 * Static effect - no movement, simple scale to output size
 */

import type { VideoOrientation } from "../../../../styles/types.ts";
import { getVideoDimensions } from "../dimensions.ts";

/**
 * Static effect parameters
 */
export interface StaticParams {
    enabled: true;
}

/**
 * Create FFmpeg filter for static effect (no movement)
 * Simply scales the image to the output resolution
 * 
 * @param inputLabel - FFmpeg input label (e.g., "0:v")
 * @param outputLabel - FFmpeg output label (e.g., "v0")
 * @param orientation - Video orientation
 * @returns FFmpeg filter string
 * 
 * @example
 * // Returns: "[0:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v0]"
 * createStaticFilter("0:v", "v0", "horizontal")
 */
export function createStaticFilter(
    inputLabel: string,
    outputLabel: string,
    orientation: VideoOrientation
): string {
    const { width, height } = getVideoDimensions(orientation);

    return `[${inputLabel}]scale=${width}:${height},setsar=1,fps=30,format=yuv420p[${outputLabel}]`;
}
