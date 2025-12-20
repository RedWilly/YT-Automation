/**
 * FFmpeg utility functions for video processing
 * Supports configurable pan effects via style system
 * Supports both horizontal (16:9) and vertical (9:16 shorts) orientations
 * Supports per-shot effects via shot type (when naturalEdit is enabled)
 */

import type { DownloadedImage, PanDirection, PanParams, ShotType } from "../types/index.ts";
import type { VideoOrientation } from "../styles/types.ts";
import { DEFAULT_VIDEO_DIMENSIONS } from "../config/defaults.ts";
import * as logger from "./logger.ts";

// Video dimensions from config
const VIDEO_WIDTH_HORIZONTAL = DEFAULT_VIDEO_DIMENSIONS.horizontal.width;
const VIDEO_HEIGHT_HORIZONTAL = DEFAULT_VIDEO_DIMENSIONS.horizontal.height;
const VIDEO_WIDTH_VERTICAL = DEFAULT_VIDEO_DIMENSIONS.vertical.width;
const VIDEO_HEIGHT_VERTICAL = DEFAULT_VIDEO_DIMENSIONS.vertical.height;

/**
 * Effect type for per-shot effects
 * - "pan" = vertical/horizontal pan (based on orientation)
 * - "zoom" = zoom in/out animation
 * - "static" = no movement
 */
type EffectType = "pan" | "zoom" | "static";

/**
 * Zoom parameters for zoom effect
 */
interface ZoomParams {
    enabled: boolean;
    zoomIn: boolean;      // true = zoom in (1.0 → 1.05), false = zoom out (1.05 → 1.0)
    startScale: number;   // Starting scale factor
    endScale: number;     // Ending scale factor
}

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
 * Calculate zoom parameters for zoom effect
 * @param duration - Scene duration in seconds
 * @returns Zoom parameters
 */
function calculateZoomParams(duration: number): ZoomParams {
    const MIN_ZOOM_DURATION = 2;

    if (duration < MIN_ZOOM_DURATION) {
        return { enabled: false, zoomIn: true, startScale: 1.0, endScale: 1.0 };
    }

    // Randomly choose zoom direction (in or out)
    const zoomIn = Math.random() > 0.5;

    // Subtle zoom: 5% scale change
    return {
        enabled: true,
        zoomIn,
        startScale: zoomIn ? 1.0 : 1.05,
        endScale: zoomIn ? 1.05 : 1.0,
    };
}

/**
 * Determine effect type based on shot type, panEnabled, and naturalEdit
 * When naturalEdit is true: shot type controls the effect
 * When naturalEdit is false: panEnabled controls all shots
 * 
 * @param shotType - Shot type from LLM (vertical/zoom/static)
 * @param panEnabled - Global pan effect setting from style
 * @param naturalEdit - Whether natural editing is enabled
 */
function determineEffectType(
    shotType: ShotType | undefined,
    panEnabled: boolean,
    naturalEdit: boolean
): EffectType {
    // If naturalEdit is disabled, use global panEnabled
    if (!naturalEdit) {
        return panEnabled ? "pan" : "static";
    }

    // naturalEdit is enabled: use shot type
    switch (shotType) {
        case "vertical":
            return "pan";
        case "zoom":
            return "zoom";
        case "static":
        default:
            return "static";
    }
}

/**
 * Create FFmpeg filter complex for image transitions
 * Supports per-shot effects when naturalEdit is enabled
 * 
 * Images generated at the appropriate resolution:
 * - Panning scenes (≥3s): 4:3 aspect ratio for pan headroom
 * - Static scenes (<3s): Native video resolution (16:9 or 9:16)
 * 
 * @param images - Sorted array of images with timing and optional shot type
 * @param panEnabled - Whether pan effect is enabled (from style config)
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

    // Process each image with optional effects
    for (let i = 0; i < imagesLength; i++) {
        const image = images[i];
        if (!image) continue;

        const duration = (image.end - image.start) / 1000;
        totalDuration += duration;

        // Determine what effect to apply to this shot
        const effectType = determineEffectType(image.type, panEnabled, naturalEdit);

        if (effectType === "pan") {
            // PAN EFFECT
            const panParams = calculatePanParams(duration, true, orientation);

            if (panParams.enabled) {
                const fps = 30;
                const totalFrames = Math.round(duration * fps);

                if (orientation === "vertical") {
                    const xExpression = `if(lte(n,${totalFrames}),${panParams.xStart}+(${panParams.xEnd}-${panParams.xStart})*n/${totalFrames},${panParams.xEnd})`;
                    filters.push(
                        `[${i}:v]scale=-1:${VIDEO_HEIGHT},fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x='${xExpression}':y=0,setsar=1,format=yuv420p[v${i}]`
                    );
                    logger.debug("Video", `Image ${i + 1}: Pan ${panParams.direction} [${image.type ?? "global"}]`);
                } else {
                    const yExpression = `if(lte(n,${totalFrames}),${panParams.yStart}+(${panParams.yEnd}-${panParams.yStart})*n/${totalFrames},${panParams.yEnd})`;
                    filters.push(
                        `[${i}:v]scale=${VIDEO_WIDTH}:-1,fps=${fps},crop=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x=0:y='${yExpression}',setsar=1,format=yuv420p[v${i}]`
                    );
                    logger.debug("Video", `Image ${i + 1}: Pan ${panParams.direction} [${image.type ?? "global"}]`);
                }
            } else {
                // Duration too short for pan, fall back to static
                filters.push(
                    `[${i}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,format=yuv420p[v${i}]`
                );
                logger.debug("Video", `Image ${i + 1}: Static (duration too short for pan)`);
            }

        } else if (effectType === "zoom") {
            // ZOOM EFFECT
            const zoomParams = calculateZoomParams(duration);

            if (zoomParams.enabled) {
                const fps = 30;
                const totalFrames = Math.round(duration * fps);

                // Subtle zoom using zoompan filter
                // Scale expression: linear interpolation between startScale and endScale
                const zoomExpr = `${zoomParams.startScale}+(${zoomParams.endScale}-${zoomParams.startScale})*on/${totalFrames}`;

                // For zoom, start with oversized image at center
                // zoompan: z=zoom expression, x/y keep center, d=duration in frames
                filters.push(
                    `[${i}:v]scale=${VIDEO_WIDTH * 2}:${VIDEO_HEIGHT * 2},zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:fps=${fps}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT},setsar=1,format=yuv420p[v${i}]`
                );
                logger.debug("Video", `Image ${i + 1}: Zoom ${zoomParams.zoomIn ? "in" : "out"} [${image.type ?? "zoom"}]`);
            } else {
                // Duration too short for zoom, fall back to static
                filters.push(
                    `[${i}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,format=yuv420p[v${i}]`
                );
                logger.debug("Video", `Image ${i + 1}: Static (duration too short for zoom)`);
            }

        } else {
            // STATIC: No effect
            filters.push(
                `[${i}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=30,format=yuv420p[v${i}]`
            );
            logger.debug("Video", `Image ${i + 1}: Static [${image.type ?? "default"}]`);
        }
    }

    // Concatenate all video segments
    const concatInputs = Array.from({ length: imagesLength }, (_, i) => `[v${i}]`).join("");
    filters.push(`${concatInputs}concat=n=${imagesLength}:v=1:a=0[outv]`);

    const filterComplex = filters.join(";");

    return { filterComplex, totalDuration };
}
