/**
 * Configuration type definitions
 * Re-exports from defaults for convenience
 */

export type { CaptionAlignment } from "./defaults.ts";

export {
    DEFAULT_VIDEO_DIMENSIONS,
    DEFAULT_VIDEO_SETTINGS,
    DEFAULT_CAPTION_STYLE,
    DEFAULT_HIGHLIGHT_STYLE,
    DEFAULT_SEGMENTATION,
    DEFAULT_LLM_SETTINGS,
    DEFAULT_IMAGE_SETTINGS,
    DEFAULT_TRANSCRIPTION,
    DEFAULT_PATHS,
} from "./defaults.ts";

export {
    type AIProvider,
    type AIImageProvider,
    type ProviderConfig,
    PROVIDER_CONFIGS,
    TELEGRAM,
    TRANSCRIPTION,
    AI_TEXT,
    AI_IMAGE,
    MINIO,
    PATHS,
    DEBUG,
    validateEnvironment,
    getAIConfig,
    parseIdList,
} from "./environment.ts";
