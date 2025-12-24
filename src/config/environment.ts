/**
 * Environment variable parsing and validation
 * Centralizes all environment configuration
 */

import * as logger from "../utils/logger.ts";
import { envBool, envNumber, envString } from "../utils/env.ts";
import {
    DEFAULT_PATHS,
    DEFAULT_LLM_SETTINGS,
    DEFAULT_TRANSCRIPTION,
    DEFAULT_IMAGE_SETTINGS,
} from "./defaults.ts";

// =============================================================
// TYPE DEFINITIONS
// =============================================================

/**
 * Supported AI providers for text generation
 */
export type AIProvider = "kimi" | "deepseek";

/**
 * Supported AI providers for image generation
 */
export type AIImageProvider = "cloudflare" | "togetherai" | "imagefx";

/**
 * AI provider configuration
 */
export interface ProviderConfig {
    model: string;
    baseUrl: string;
    apiKey: string;
}

// =============================================================
// HELPER FUNCTIONS
// =============================================================

/**
 * Parse a comma-separated list of numeric IDs from an environment variable
 * @param envValue - Raw environment variable string (e.g., "123, -1009876543210")
 * @returns Parsed list of numeric IDs
 */
export function parseIdList(envValue?: string): number[] {
    if (!envValue) return [];

    const items = envValue.split(",");
    const values: number[] = [];
    for (const item of items) {
        const raw = item.trim();
        if (raw.length === 0) continue;
        const n = Number(raw);
        if (Number.isFinite(n) && Number.isSafeInteger(n)) {
            values.push(n);
        }
    }
    return values;
}

// =============================================================
// AI PROVIDER CONFIGURATIONS
// =============================================================

/**
 * AI provider configurations for text generation
 */
export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
    kimi: {
        model: "kimi-k2-0905-preview",
        baseUrl: "https://api.moonshot.ai/v1",
        apiKey: envString("KIMI_API_KEY"),
    },
    deepseek: {
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: envString("DEEPSEEK_API_KEY"),
    },
};

// =============================================================
// ENVIRONMENT CONFIGURATION
// =============================================================

/**
 * Telegram bot configuration
 */
export const TELEGRAM = {
    botToken: envString("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: parseIdList(process.env.ALLOWED_USER_IDS),
    allowedChatIds: parseIdList(process.env.ALLOWED_CHAT_IDS),
} as const;

/**
 * Transcription service configuration
 */
export const TRANSCRIPTION = {
    assemblyAiKey: envString("ASSEMBLYAI_API_KEY"),
    pollIntervalMs: envNumber("ASSEMBLYAI_POLL_INTERVAL_MS", DEFAULT_TRANSCRIPTION.pollIntervalMs),
    maxPolls: envNumber("ASSEMBLYAI_MAX_POLLS", DEFAULT_TRANSCRIPTION.maxPolls),
} as const;

/**
 * AI text generation configuration
 */
export const AI_TEXT = {
    provider: envString("AI_PROVIDER") as AIProvider,
    segmentsPerBatch: envNumber("LLM_SEGMENTS_PER_BATCH", DEFAULT_LLM_SETTINGS.segmentsPerBatch),
    useAiImage: envBool("USE_AI_IMAGE"),
} as const;

/**
 * AI image generation configuration
 */
export const AI_IMAGE = {
    provider: envString("AI_IMAGE_MODEL") as AIImageProvider,
    workerApiKey: envString("WORKER_API_KEY"),
    togetherApiKey: envString("TOGETHER_API_KEY"),
    googleCookie: envString("GOOGLE_COOKIE"),
    searchDelayMs: envNumber("WEB_SEARCH_DELAY_MS", DEFAULT_IMAGE_SETTINGS.searchDelayMs),
    retryAttempts: envNumber("IMAGE_RETRY_ATTEMPTS", DEFAULT_IMAGE_SETTINGS.retryAttempts),
} as const;

/**
 * MinIO object storage configuration
 */
export const MINIO = {
    enabled: envBool("MINIO_ENABLED"),
    endpoint: envString("MINIO_ENDPOINT"),
    accessKey: envString("MINIO_ACCESS_KEY"),
    secretKey: envString("MINIO_SECRET_KEY"),
    bucket: envString("MINIO_BUCKET", "finished-videos"),
    region: envString("MINIO_REGION", "us-east-1"),
} as const;

/**
 * File paths configuration
 */
export const PATHS = {
    audio: envString("TMP_AUDIO_DIR", DEFAULT_PATHS.audio),
    images: envString("TMP_IMAGES_DIR", DEFAULT_PATHS.images),
    video: envString("TMP_VIDEO_DIR", DEFAULT_PATHS.video),
    cache: envString("CACHE_DB_PATH", DEFAULT_PATHS.cache),
} as const;

/**
 * Debug and logging configuration
 */
export const DEBUG = {
    enabled: envBool("DEBUG"),
} as const;

// =============================================================
// VALIDATION
// =============================================================

/**
 * Validate required environment configuration
 * Called at startup to ensure critical values are set
 */
export function validateEnvironment(): void {
    // Validate AI provider
    const provider = AI_TEXT.provider;
    if (!provider || !PROVIDER_CONFIGS[provider]) {
        logger.error("Config", "❌ Invalid or missing AI_PROVIDER in .env file.");
        logger.error("Config", `Supported providers: ${Object.keys(PROVIDER_CONFIGS).join(", ")}`);
        process.exit(1);
    }

    // Validate API key for selected provider
    const config = PROVIDER_CONFIGS[provider];
    if (!config.apiKey) {
        logger.error("Config", `❌ Missing API key for provider: ${provider}`);
        process.exit(1);
    }

    // Validate Telegram token
    if (!TELEGRAM.botToken) {
        logger.error("Config", "❌ Missing TELEGRAM_BOT_TOKEN in .env file.");
        process.exit(1);
    }

    // Validate AssemblyAI key
    if (!TRANSCRIPTION.assemblyAiKey) {
        logger.error("Config", "❌ Missing ASSEMBLYAI_API_KEY in .env file.");
        process.exit(1);
    }
}

/**
 * Get the active AI provider configuration
 */
export function getAIConfig(): ProviderConfig {
    return PROVIDER_CONFIGS[AI_TEXT.provider];
}
