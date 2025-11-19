/**
 * FFmpeg utility functions for video processing
 */

import { PAN_EFFECT } from "../constants.ts";
import type { DownloadedImage, PanDirection, PanParams } from "../types.ts";
import * as logger from "../logger.ts";

/**
 * Calculate pan parameters based on image aspect ratio and duration
 * @param duration - Scene duration in seconds
 * @returns Pan parameters for zoompan filter
 */
export function calculatePanParams(duration: number): PanParams {
    // If pan effect is disabled, return disabled params
    if (!PAN_EFFECT) {
        return {
            enabled: false,
            direction: "down",
            yStart: 0,
            yEnd: 0,
        };
    }

    // Target video dimensions
    const VIDEO_WIDTH = 1920;
    const VIDEO_HEIGHT = 1080;

    // AI-generated image dimensions (4:3 aspect ratio)
    const IMAGE_WIDTH = 1472;
    const IMAGE_HEIGHT = 1104;

    // Calculate scaled dimensions when fitting image to video width
    // The image will be scaled to fit 1920px width while maintaining aspect ratio
    const scaledHeight = (IMAGE_HEIGHT * VIDEO_WIDTH) / IMAGE_WIDTH; // = 1440px

    // Calculate total vertical headroom (extra space above and below)
    const totalHeadroom = scaledHeight - VIDEO_HEIGHT; // = 1440 - 1080 = 360px

    // Use 30% of available headroom for visible pan effect
    // NOTE: Increased from 15% to 30% to make pan more visible
    const usableHeadroom = totalHeadroom * 0.30; // 30% of 360px = 108px

    // Leave buffer zones at top and bottom (remaining 70% of headroom)
    const bufferZone = (totalHeadroom - usableHeadroom) / 2; // = (360 - 108) / 2 = 126px

    // Randomly choose pan direction (up or down)
    const direction: PanDirection = Math.random() > 0.5 ? "down" : "up";

    // Calculate start and end Y positions in pixels
    let yStart: number;
    let yEnd: number;

    if (direction === "down") {
        // Pan down: start at top buffer, end at top buffer + usable headroom
        yStart = bufferZone;
        yEnd = bufferZone + usableHeadroom;
    } else {
        // Pan up: start at top buffer + usable headroom, end at top buffer
        yStart = bufferZone + usableHeadroom;
        yEnd = bufferZone;
    }

    return {
        enabled: true,
        direction,
        yStart: Math.round(yStart),
        yEnd: Math.round(yEnd),
    };
}

/**
 * Create FFmpeg filter complex for image transitions
 * @param images - Sorted array of images with timing
 * @returns Filter complex string and total duration
 */
export function createFilterComplex(
    images: DownloadedImage[]
): { filterComplex: string; totalDuration: number } {
    const filters: string[] = [];
    let totalDuration = 0;

    const imagesLength = images.length;

    // Process each image with optional pan effect
    for (let i = 0; i < imagesLength; i++) {
        const image = images[i];
        if (!image) continue;

        const duration = (image.end - image.start) / 1000; // Convert ms to seconds
        totalDuration += duration;

        // Calculate pan parameters for this image
        const panParams = calculatePanParams(duration);

        if (panParams.enabled) {
            // Apply pan effect using scale + crop (NO ZOOMPAN!)
            //
            // Why not zoompan?
            // - zoompan is designed for zoom effects, not simple panning
            // - It has complex frame timing issues with -loop 1
            // - For vertical pan only, we just need: scale → crop with animated Y position
            //
            // Filter chain:
            // 1. scale=1920:-1 → Scale to 1920px width, maintain aspect ratio (creates 1920×1440 for 4:3 images)
            // 2. fps=30 → Set frame rate to 30fps BEFORE crop (ensures proper frame generation)
            // 3. crop → Crop to 1920×1080 with animated Y position (this creates the pan effect)
            // 4. setsar=1 → Set sample aspect ratio to 1:1
            // 5. format=yuv420p → Convert to YUV420P color format

            const fps = 30;
            const totalFrames = Math.round(duration * fps);

            // Animated Y position for crop filter
            //
            // The crop filter's y parameter can use expressions with 'n' (frame number)
            // Formula: yStart + (yEnd - yStart) * (n / totalFrames)
            //
            // 'n' starts at 0 and increments by 1 for each frame
            // We clamp it to totalFrames to prevent overshooting
            const yExpression = `if(lte(n,${totalFrames}),${panParams.yStart}+(${panParams.yEnd}-${panParams.yStart})*n/${totalFrames},${panParams.yEnd})`;

            // Crop filter parameters:
            // - w=1920: Output width (crop to 1920px)
            // - h=1080: Output height (crop to 1080px)
            // - x=0: Horizontal position (no horizontal pan, start at left edge)
            // - y=...: Vertical position (animated from yStart to yEnd)
            //
            // This crops a 1920×1080 window from the 1920×1440 scaled image,
            // with the Y position animating from yStart to yEnd over totalFrames frames
            filters.push(
                `[${i}:v]scale=1920:-1,fps=${fps},crop=w=1920:h=1080:x=0:y='${yExpression}',setsar=1,format=yuv420p[v${i}]`
            );

            logger.debug("Video", `Image ${i + 1}: Pan ${panParams.direction} (${panParams.yStart}px → ${panParams.yEnd}px) over ${duration.toFixed(2)}s (${totalFrames} frames)`);
        } else {
            // No pan effect - use static image with scale and pad
            filters.push(
                `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`
            );
        }
    }

    // Concatenate all video segments
    const concatInputs = Array.from({ length: imagesLength }, (_, i) => `[v${i}]`).join("");
    filters.push(`${concatInputs}concat=n=${imagesLength}:v=1:a=0[outv]`);

    const filterComplex = filters.join(";");

    return { filterComplex, totalDuration };
}
