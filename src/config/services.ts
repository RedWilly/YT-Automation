/**
 * Service configurations
 * Telegram, transcription, image, storage, and path configurations
 */

import { envBool, envNumber, envString } from "../utils/env.ts";
import {
    DEFAULT_PATHS,
    DEFAULT_TRANSCRIPTION,
    DEFAULT_IMAGE_SETTINGS,
} from './defaults.ts';
import type { AIProvider, AIImageProvider } from './providers.ts';

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

    const items = envValue.split(',');
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
    provider: envString('AI_PROVIDER') as AIProvider,
    useAiImage: envBool('USE_AI_IMAGE'),
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
    enabled: envBool("PRODUCTION"),
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
