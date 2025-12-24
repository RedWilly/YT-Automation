/**
 * Zoom Effect Module (Verified Camera Implementation)
 * 
 * Architecture: "Super-Sampled Native Zoompan"
 * 
 * Why this vs Scale+Crop?
 * - Scale+Crop suffers from quantization noise (shaking) due to integer rounding
 * - Zoompan uses internal float precision and supersampling for smooth sub-pixel motion
 * 
 * Fixes for previous issues:
 * 1. Duration Explosion -> Uses `select='eq(n,0)'` to feed single frame
 * 2. Shaking/Jerky -> 
 *    - Uses Cosine Ease-In-Out for natural acceleration
 *    - Uses 4x SUPER-SAMPLING (Lanczos) to eliminate sub-pixel aliasing/shimmering
 * 3. Drift -> Uses mathematically perfect centering `iw/2-(iw/zoom/2)`
 * 4. Infinite Zoom -> Uses `on/(d-1)` to ensure animation finishes exactly at end value
 */

import type { VideoOrientation } from "../../../../styles/types.ts";
import { getVideoDimensions } from "../dimensions.ts";

const MIN_ZOOM_DURATION = 2;
const ZOOM_LEVEL = 1.15; // Moderate 15% zoom
const ZOOM_FPS = 30;

export interface ZoomParams {
    enabled: boolean;
    zoomIn: boolean;
    startZoom: number;
    endZoom: number;
}

export function calculateZoomParams(duration: number): ZoomParams {
    if (duration < MIN_ZOOM_DURATION) {
        return { enabled: false, zoomIn: true, startZoom: 1.0, endZoom: 1.0 };
    }

    const zoomIn = Math.random() > 0.5;

    return {
        enabled: true,
        zoomIn,
        startZoom: zoomIn ? 1.0 : ZOOM_LEVEL,
        endZoom: zoomIn ? ZOOM_LEVEL : 1.0,
    };
}

export function createZoomFilter(
    inputLabel: string,
    outputLabel: string,
    duration: number,
    orientation: VideoOrientation
): { filter: string; enabled: boolean; zoomIn?: boolean } {
    const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = getVideoDimensions(orientation);
    const params = calculateZoomParams(duration);

    if (!params.enabled) {
        return {
            filter: `[${inputLabel}]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:flags=lanczos,setsar=1,fps=${ZOOM_FPS},format=yuv420p[${outputLabel}]`,
            enabled: false,
        };
    }

    const totalFrames = Math.round(duration * ZOOM_FPS);

    // Easing Logic: Switched to Linear to prevent "finishing early" feel.
    // User requested zoom should take entirely duration to complete.
    // Cosine/Sine easing slows down effectively to 0 speed at the end, making it look stopped.
    // Linear ensures constant motion until the very last frame.
    const progress = `on/(${totalFrames}-1)`;
    // const eased = `(1-cos(PI*${progress}))/2`; // Removed cosine easing

    const zoomDelta = params.endZoom - params.startZoom;
    const zoomExpr = `${params.startZoom}+${zoomDelta}*${progress}`;

    // Centering Logic
    const xExpr = `iw/2-(iw/zoom/2)`;
    const yExpr = `ih/2-(ih/zoom/2)`;

    // SUPER-SAMPLING RESOLUTION (4x)
    // We work at huge resolution to eliminate aliasing "shake"
    const SS_WIDTH = VIDEO_WIDTH * 4;
    const SS_HEIGHT = VIDEO_HEIGHT * 4;

    // Filter Chain:
    // 1. select='eq(n,0)'   -> Extract single frame
    // 2. scale=4x           -> Upscale huge (Lanczos) to prevent aliasing
    // 3. zoompan            -> Apply zoom on huge image (smooth float math)
    // 4. scale=1x           -> Downscale (Lanczos) to smooth out any remaining artifacts
    // 5. setsar/format      -> Finalize

    const filter = `[${inputLabel}]select='eq(n\\,0)',scale=${SS_WIDTH}:${SS_HEIGHT}:flags=lanczos,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${SS_WIDTH}x${SS_HEIGHT}:fps=${ZOOM_FPS},scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:flags=lanczos,setsar=1,format=yuv420p[${outputLabel}]`;

    return {
        filter,
        enabled: true,
        zoomIn: params.zoomIn,
    };
}
