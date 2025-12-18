/**
 * Default configuration values for the application
 * These values are used when not overridden by styles or runtime options
 * 
 * Configuration Cascade:
 * DEFAULTS (this file) → STYLE (presets) → RUNTIME OPTIONS → RESOLVED
 */

// =============================================================
// VIDEO SETTINGS
// =============================================================

/**
 * Default video dimensions for horizontal and vertical orientations
 */
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

/**
 * Default video generation settings
 */
export const DEFAULT_VIDEO_SETTINGS = {
    /** Number of images to process per FFmpeg chunk (prevents memory exhaustion) */
    imagesPerChunk: 8,
    /** Default orientation */
    orientation: "horizontal" as const,
    /** Enable pan/zoom effects */
    panEffect: false,
} as const;

// =============================================================
// CAPTION SETTINGS
// =============================================================

/**
 * ASS Subtitle Alignment Values
 * 
 * Position grid:
 *   7 8 9   ← Top
 *   4 5 6   ← Middle
 *   1 2 3   ← Bottom
 * 
 * Common values:
 *   2 = Bottom center (most common for captions)
 *   5 = Middle center (for subtitles)
 *   8 = Top center
 */
export type CaptionAlignment = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * Default caption style settings
 */
export const DEFAULT_CAPTION_STYLE = {
    /** Font name (must be available in system or bundled) */
    fontName: "Resolve-Bold",
    /** Font size in pixels */
    fontSize: 72,
    /** Primary text color in ASS format (&HAABBGGRR) */
    primaryColor: "&H00FFFFFF",
    /** Outline/border color */
    outlineColor: "&H00000000",
    /** Background color (for box mode) */
    backgroundColor: "&H80000000",
    /** Outline width in pixels */
    outlineWidth: 3,
    /** Shadow depth in pixels */
    shadowDepth: 0,
    /** Use opaque box behind text instead of outline */
    useBox: false,

    // Position & Layout
    /** Caption alignment (1-9, see grid above) */
    alignment: 2 as CaptionAlignment,
    /** Vertical margin from edge (pixels) */
    marginV: 130,
    /** Vertical margin for vertical videos (pixels) */
    marginVVertical: 550,
    /** Left margin (pixels) */
    marginL: 10,
    /** Right margin (pixels) */
    marginR: 10,

    // Text Transform
    /** Horizontal scale (100 = normal) */
    scaleX: 100,
    /** Vertical scale (100 = normal) */
    scaleY: 100,
    /** Letter spacing (0 = normal) */
    letterSpacing: 0,
    /** Bold text (-1 = true, 0 = false in ASS) */
    bold: true,
    /** Italic text */
    italic: false,
    /** Force uppercase text */
    uppercase: true,
} as const;

/**
 * Default highlight style for karaoke effect
 */
export const DEFAULT_HIGHLIGHT_STYLE = {
    /** Enable karaoke highlighting */
    enabled: true,
    /** Highlight color in ASS format */
    color: "&H0000FFFF",
    /** Use box for highlight instead of colored text */
    useBox: true,
    /** Outline width when highlighted (used with box mode) */
    outlineWidth: 6,
} as const;

// =============================================================
// SEGMENTATION SETTINGS
// =============================================================

/**
 * Default segmentation settings
 */
export const DEFAULT_SEGMENTATION = {
    /** Segmentation type: "sentence" or "wordCount" */
    type: "sentence" as const,
    /** Words per segment (for wordCount mode) */
    wordsPerSegment: 15,
    /** Minimum words per caption group */
    minWordsPerCaption: 3,
    /** Maximum words per caption group */
    maxWordsPerCaption: 6,
    /** Timing tolerance for word-to-segment matching (ms) */
    timingToleranceMs: 100,
} as const;

/**
 * Default multi-image segmentation settings
 */
export const DEFAULT_MULTI_IMAGE = {
    /** Enable multi-image generation for longer sentences */
    enabled: false,
    /** Word threshold before splitting into multiple images */
    threshold: 12,
    /** Maximum images per segment */
    maxImagesPerSegment: 3,
} as const;

// =============================================================
// LLM SETTINGS
// =============================================================

/**
 * Default LLM (Language Model) settings
 */
export const DEFAULT_LLM_SETTINGS = {
    /** Temperature for response randomness (0-1) */
    temperature: 0.4,
    /** Maximum tokens in response */
    maxTokens: 8000,
    /** Number of segments to process per LLM batch */
    segmentsPerBatch: 60,
    /** Maximum retry attempts */
    maxRetries: 3,
} as const;

// =============================================================
// IMAGE SETTINGS
// =============================================================

/**
 * Default image search/generation settings
 */
export const DEFAULT_IMAGE_SETTINGS = {
    /** Delay between image requests (ms) - prevents rate limiting */
    searchDelayMs: 2200,
    /** Maximum retry attempts for failed downloads */
    retryAttempts: 30,
    /** Domains to filter (watermarked stock photos) */
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

/**
 * Default AssemblyAI transcription settings
 */
export const DEFAULT_TRANSCRIPTION = {
    /** Polling interval for transcript status (ms) */
    pollIntervalMs: 2200,
    /** Maximum polling attempts */
    maxPolls: 60,
} as const;

// =============================================================
// DIRECTORY PATHS
// =============================================================

/**
 * Default temporary directory paths
 */
export const DEFAULT_PATHS = {
    audio: "tmp/audio",
    images: "tmp/images",
    video: "tmp/video",
    cache: "tmp/cache.sqlite",
} as const;
