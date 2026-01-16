import { envBool, envNumber, envString } from "../utils/env.ts";
import {
    DEFAULT_PATHS,
    DEFAULT_TRANSCRIPTION,
    DEFAULT_IMAGE_SETTINGS,
} from './defaults.ts';
import type { AIProvider, AIImageProvider } from './providers.ts';

/** Parse comma-separated numeric IDs (e.g., "123, -1009876543210") */
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

export const TELEGRAM = {
    botToken: envString("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: parseIdList(process.env.ALLOWED_USER_IDS),
    allowedChatIds: parseIdList(process.env.ALLOWED_CHAT_IDS),
} as const;

export const TRANSCRIPTION = {
    assemblyAiKey: envString("ASSEMBLYAI_API_KEY"),
    pollIntervalMs: envNumber("ASSEMBLYAI_POLL_INTERVAL_MS", DEFAULT_TRANSCRIPTION.pollIntervalMs),
    maxPolls: envNumber("ASSEMBLYAI_MAX_POLLS", DEFAULT_TRANSCRIPTION.maxPolls),
} as const;

export const AI_TEXT = {
    provider: envString('AI_PROVIDER') as AIProvider,
    useAiImage: envBool('USE_AI_IMAGE'),
} as const;

export const AI_IMAGE = {
    provider: envString("AI_IMAGE_MODEL") as AIImageProvider,
    workerApiKey: envString("WORKER_API_KEY"),
    togetherApiKey: envString("TOGETHER_API_KEY"),
    googleCookie: envString("GOOGLE_COOKIE"),
    searchDelayMs: envNumber("WEB_SEARCH_DELAY_MS", DEFAULT_IMAGE_SETTINGS.searchDelayMs),
    retryAttempts: envNumber("IMAGE_RETRY_ATTEMPTS", DEFAULT_IMAGE_SETTINGS.retryAttempts),
} as const;

export const MINIO = {
    enabled: envBool("PRODUCTION"),
    endpoint: envString("MINIO_ENDPOINT"),
    accessKey: envString("MINIO_ACCESS_KEY"),
    secretKey: envString("MINIO_SECRET_KEY"),
    bucket: envString("MINIO_BUCKET", "finished-videos"),
    region: envString("MINIO_REGION", "us-east-1"),
} as const;

export const PATHS = {
    audio: envString("TMP_AUDIO_DIR", DEFAULT_PATHS.audio),
    images: envString("TMP_IMAGES_DIR", DEFAULT_PATHS.images),
    video: envString("TMP_VIDEO_DIR", DEFAULT_PATHS.video),
    cache: envString("CACHE_DB_PATH", DEFAULT_PATHS.cache),
} as const;

export const DEBUG = {
    enabled: envBool("DEBUG"),
} as const;
