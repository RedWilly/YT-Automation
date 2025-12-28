/**
 * Pan effect - vertical pan (up/down) for horizontal video
 *              horizontal pan (left/right) for vertical video
 * 
 * Uses native aspect ratio images scaled 10% larger than canvas.
 * Pan starts at edge of image aligned with edge of viewport,
 * then moves to opposite edge.
 */

import type { VideoOrientation } from '../../../../styles/types.ts';
import type { PanDirection, PanParams } from '../../../../types/index.ts';
import { getVideoDimensions } from '../dimensions.ts';

/** Minimum duration (seconds) for pan effect - shorter scenes use static */
const MIN_PAN_DURATION = 3;

/** Scale factor for pan images (10% larger than canvas) */
export const PAN_SCALE_FACTOR = 1.10;

/**
 * Calculate pan parameters based on duration and orientation
 * 
 * Images are native aspect ratio but 10% larger than canvas.
 * Pan starts at one edge and moves to the opposite edge.
 * 
 * @param duration - Scene duration in seconds
 * @param orientation - Video orientation (horizontal or vertical)
 * @returns Pan parameters with direction and positions
 */
export function calculatePanParams(
    duration: number,
    orientation: VideoOrientation = 'horizontal'
): PanParams {
    // Too short for pan - would look jarring
    if (duration < MIN_PAN_DURATION) {
        return {
            enabled: false,
            direction: 'down',
            yStart: 0,
            yEnd: 0,
            xStart: 0,
            xEnd: 0,
        };
    }

    const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = getVideoDimensions(orientation);

    // Calculate scaled image dimensions (10% larger)
    const scaledWidth = Math.round(VIDEO_WIDTH * PAN_SCALE_FACTOR);
    const scaledHeight = Math.round(VIDEO_HEIGHT * PAN_SCALE_FACTOR);

    // Total headroom = (scaled - canvas)
    const headroomX = scaledWidth - VIDEO_WIDTH;
    const headroomY = scaledHeight - VIDEO_HEIGHT;

    if (orientation === 'vertical') {
        // VERTICAL VIDEO: Horizontal pan (left/right)
        // Random direction
        const direction: PanDirection = Math.random() > 0.5 ? 'right' : 'left';

        // Pan RIGHT: start at left edge (x=0), end at right edge (x=headroom)
        // Pan LEFT: start at right edge (x=headroom), end at left edge (x=0)
        const xStart = direction === 'right' ? 0 : headroomX;
        const xEnd = direction === 'right' ? headroomX : 0;

        return {
            enabled: true,
            direction,
            yStart: Math.round(headroomY / 2), // Center vertically
            yEnd: Math.round(headroomY / 2),
            xStart,
            xEnd,
        };
    } else {
        // HORIZONTAL VIDEO: Vertical pan (up/down)
        // Random direction
        const direction: PanDirection = Math.random() > 0.5 ? 'down' : 'up';

        // Pan DOWN: start at top edge (y=0), end at bottom edge (y=headroom)
        // Pan UP: start at bottom edge (y=headroom), end at top edge (y=0)
        const yStart = direction === 'down' ? 0 : headroomY;
        const yEnd = direction === 'down' ? headroomY : 0;

        return {
            enabled: true,
            direction,
            yStart,
            yEnd,
            xStart: Math.round(headroomX / 2), // Center horizontally
            xEnd: Math.round(headroomX / 2),
        };
    }
}

/**
 * Create FFmpeg filter for pan effect
 * 
 * Images are pre-scaled 10% larger than canvas by the provider.
 * This filter scales to maintain that size, then crops with animated position.
 * 
 * @param inputLabel - FFmpeg input label (e.g., "0:v")
 * @param outputLabel - FFmpeg output label (e.g., "v0")
 * @param duration - Scene duration in seconds
 * @param orientation - Video orientation
 * @returns FFmpeg filter string and whether pan is enabled
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

    // Calculate scaled dimensions for the filter
    const scaledWidth = Math.round(VIDEO_WIDTH * PAN_SCALE_FACTOR);
    const scaledHeight = Math.round(VIDEO_HEIGHT * PAN_SCALE_FACTOR);

    if (orientation === 'vertical') {
        // Horizontal pan (left/right)
        const xExpr = `if(lte(n,${totalFrames}),${params.xStart}+(${params.xEnd}-${params.xStart})*n/${totalFrames},${params.xEnd})`;

        return {
            filter: `[${inputLabel}]scale=${scaledWidth}:${scaledHeight},fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x='${xExpr}':y=${params.yStart},setsar=1,format=yuv420p[${outputLabel}]`,
            enabled: true,
            direction: params.direction,
        };
    } else {
        // Vertical pan (up/down)
        const yExpr = `if(lte(n,${totalFrames}),${params.yStart}+(${params.yEnd}-${params.yStart})*n/${totalFrames},${params.yEnd})`;

        return {
            filter: `[${inputLabel}]scale=${scaledWidth}:${scaledHeight},fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x=${params.xStart}:y='${yExpr}',setsar=1,format=yuv420p[${outputLabel}]`,
            enabled: true,
            direction: params.direction,
        };
    }
}
