import type { CaptionAlignment } from "../styles/types.ts";

// =============================================================
// VIDEO SETTINGS
// =============================================================

export const DEFAULT_VIDEO_DIMENSIONS = {
    horizontal: {
        width: 1920,
        height: 1080,
    },
    vertical: {
        width: 1080,
        height: 1920,
    },
} as const;

export const DEFAULT_VIDEO_SETTINGS = {
    /** Prevents memory exhaustion during FFmpeg processing */
    imagesPerChunk: 8,
    orientation: "horizontal" as const,
    panEffect: false,
} as const;

// =============================================================
// CAPTION SETTINGS
// =============================================================

export const DEFAULT_CAPTION_STYLE = {
    fontName: "Resolve-Bold",
    fontSize: 72,
    /** ASS color format: &HAABBGGRR */
    primaryColor: "&H00FFFFFF",
    /** ASS color format: &HAABBGGRR */
    outlineColor: "&H00000000",
    /** ASS color format: &HAABBGGRR */
    backgroundColor: "&H80000000",
    outlineWidth: 3,
    shadowDepth: 0,
    useBox: false,

    /** ASS alignment grid: 1-9 (numpad layout) */
    alignment: 2 as CaptionAlignment,
    marginV: 130,
    marginVVertical: 550,
    marginL: 10,
    marginR: 10,

    /** 100 = normal scale */
    scaleX: 100,
    /** 100 = normal scale */
    scaleY: 100,
    letterSpacing: 0,
    /** ASS bold: -1 = true, 0 = false */
    bold: true,
    italic: false,
    uppercase: true,
} as const;

export const DEFAULT_HIGHLIGHT_STYLE = {
    enabled: true,
    /** ASS color format: &HAABBGGRR */
    color: "&H0000FFFF",
    useBox: true,
    outlineWidth: 6,
} as const;

// =============================================================
// IMAGE SETTINGS
// =============================================================

export const DEFAULT_IMAGE_SETTINGS = {
    /** Prevents rate limiting */
    searchDelayMs: 2200,
    retryAttempts: 30,
    watermarkedDomains: [
        "dreamstime.com",
        "alamy.com",
        "freepik.com",
        "gettyimages.com",
        "vectorstock.com",
        "vecteezy.com",
    ],
} as const;

// =============================================================
// TRANSCRIPTION SETTINGS
// =============================================================

export const DEFAULT_TRANSCRIPTION = {
    pollIntervalMs: 2200,
    maxPolls: 60,
} as const;

// =============================================================
// DIRECTORY PATHS
// =============================================================

export const DEFAULT_PATHS = {
    audio: "tmp/audio",
    images: "tmp/images",
    video: "tmp/video",
    cache: "tmp/cache.sqlite",
} as const;
