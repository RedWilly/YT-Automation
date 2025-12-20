/**
 * Zoom effect - center-based zoom in/out
 * 
 * Zoom In:  scale 1.0 → 1.1 (image grows, edges get cropped)
 * Zoom Out: scale 1.1 → 1.0 (starts cropped, reveals full image)
 * 
 * Uses scale with eval=frame + trim for precise frame control.
 * No headroom needed - uses native 16:9 (or 9:16) images.
 */

import type { VideoOrientation } from "../../../../styles/types.ts";
import { getVideoDimensions } from "../dimensions.ts";

/** Minimum duration (seconds) for zoom effect - shorter scenes use static */
const MIN_ZOOM_DURATION = 2;

/** Zoom intensity (10% scale change) */
const ZOOM_SCALE = 0.10;

/**
 * Zoom effect parameters
 */
export interface ZoomParams {
    enabled: boolean;
    zoomIn: boolean;      // true = zoom in (1.0→1.1), false = zoom out (1.1→1.0)
    startScale: number;
    endScale: number;
}

/**
 * Calculate zoom parameters
 * 
 * @param duration - Scene duration in seconds
 * @returns Zoom parameters with direction and scale values
 */
export function calculateZoomParams(duration: number): ZoomParams {
    if (duration < MIN_ZOOM_DURATION) {
        return { enabled: false, zoomIn: true, startScale: 1.0, endScale: 1.0 };
    }

    // Random direction
    const zoomIn = Math.random() > 0.5;

    return {
        enabled: true,
        zoomIn,
        startScale: zoomIn ? 1.0 : 1.0 + ZOOM_SCALE,
        endScale: zoomIn ? 1.0 + ZOOM_SCALE : 1.0,
    };
}

/**
 * Create FFmpeg filter for zoom effect
 * 
 * Uses scale with eval=frame to animate zoom per-frame,
 * then crops center to maintain output size.
 * 
 * @param inputLabel - FFmpeg input label (e.g., "0:v")
 * @param outputLabel - FFmpeg output label (e.g., "v0")
 * @param duration - Scene duration in seconds
 * @param orientation - Video orientation
 * @returns FFmpeg filter string and zoom info
 * 
 * @example
 * // Zoom in effect:
 * // "[0:v]fps=30,trim=end_frame=120,scale=w='...':h='...':eval=frame,crop=...,setsar=1,format=yuv420p[v0]"
 */
export function createZoomFilter(
    inputLabel: string,
    outputLabel: string,
    duration: number,
    orientation: VideoOrientation
): { filter: string; enabled: boolean; zoomIn?: boolean } {
    const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = getVideoDimensions(orientation);
    const params = calculateZoomParams(duration);

    if (!params.enabled) {
        // Fall back to static
        return {
            filter: `[${inputLabel}]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,format=yuv420p[${outputLabel}]`,
            enabled: false,
        };
    }

    const fps = 30;
    const totalFrames = Math.round(duration * fps);

    // Scale expression: linear interpolation based on frame number
    const scaleExpr = `${params.startScale}+(${params.endScale}-${params.startScale})*n/${totalFrames}`;

    // Width/height expressions (must be even for video encoding)
    const wExpr = `trunc(${VIDEO_WIDTH}*(${scaleExpr})/2)*2`;
    const hExpr = `trunc(${VIDEO_HEIGHT}*(${scaleExpr})/2)*2`;

    // Crop center
    const cropX = `(iw-${VIDEO_WIDTH})/2`;
    const cropY = `(ih-${VIDEO_HEIGHT})/2`;

    // Filter chain: fps → trim → scale (animated) → crop (center)
    const filter = `[${inputLabel}]fps=${fps},trim=end_frame=${totalFrames},scale=w='${wExpr}':h='${hExpr}':eval=frame,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:'${cropX}':'${cropY}',setsar=1,format=yuv420p[${outputLabel}]`;

    return {
        filter,
        enabled: true,
        zoomIn: params.zoomIn,
    };
}
