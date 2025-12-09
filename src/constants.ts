import * as logger from "./logger.ts";

/**
 * Application constants and environment variables
 */

// Telegram Bot Configuration
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// AssemblyAI Configuration
export const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || "";

/**
 * Parse a comma-separated list of numeric IDs from an environment variable into a number array.
 * Ensures only safe integers are included and ignores empty entries.
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

// Telegram Access Control (optional). If both lists are empty, all users/chats are allowed.
export const ALLOWED_USER_IDS = parseIdList(process.env.ALLOWED_USER_IDS);
export const ALLOWED_CHAT_IDS = parseIdList(process.env.ALLOWED_CHAT_IDS);

// AI Provider Configuration
export type AIProvider = "kimi" | "deepseek";

export interface ProviderConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
}

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  kimi: {
    model: "kimi-k2-0905-preview",
    baseUrl: "https://api.moonshot.ai/v1",
    apiKey: process.env.KIMI_API_KEY || ""
  },
  deepseek: {
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY || ""
  }
};

// Select provider (Make sure to set the AI provider In the.env file)
export const AI_PROVIDER = process.env.AI_PROVIDER as AIProvider;

if (!AI_PROVIDER || !PROVIDER_CONFIGS[AI_PROVIDER]) {
  logger.error("Config", "❌ Invalid or missing AI_PROVIDER in .env file.");
  logger.error("Config", `Supported providers: ${Object.keys(PROVIDER_CONFIGS).join(", ")}`);
  process.exit(1);
}

// Export selected provider configuration
export const AI_CONFIG = PROVIDER_CONFIGS[AI_PROVIDER];
export const AI_API_KEY = AI_CONFIG.apiKey;
export const AI_BASE_URL = AI_CONFIG.baseUrl;
export const AI_MODEL = AI_CONFIG.model;
// Max number of transcript segments to send to LLM per batch
export const LLM_SEGMENTS_PER_BATCH = Number(process.env.LLM_SEGMENTS_PER_BATCH) || 60;

// Directory Paths
export const TMP_AUDIO_DIR = "tmp/audio";
export const TMP_IMAGES_DIR = "tmp/images";
export const TMP_VIDEO_DIR = "tmp/video";

// SQLite Cache Database Path
export const CACHE_DB_PATH = process.env.CACHE_DB_PATH || "tmp/cache.sqlite";

// Video Dimensions
export const VIDEO_WIDTH_HORIZONTAL = 1920;
export const VIDEO_HEIGHT_HORIZONTAL = 1080;
export const VIDEO_WIDTH_VERTICAL = 1080;
export const VIDEO_HEIGHT_VERTICAL = 1920;

// Web Search Configuration
export const WEB_SEARCH_DELAY_MS = 2200;
export const IMAGE_RETRY_ATTEMPTS = 30;

// AssemblyAI Polling Configuration
export const ASSEMBLYAI_POLL_INTERVAL_MS = 2200;
export const ASSEMBLYAI_MAX_POLLS = 60; // Max polls (~2 minutes total)

// Video Generation Configuration
export const IMAGES_PER_CHUNK = 8; // Number of images to process per chunk (prevents memory exhaustion - ffmpeg)

// AI Image Generation Configuration
export const USE_AI_IMAGE = process.env.USE_AI_IMAGE === "true";

// AI Image Model Provider Configuration
export type AIImageModel = "cloudflare" | "togetherai" | "imagefx";
export const AI_IMAGE_MODEL = (process.env.AI_IMAGE_MODEL) as AIImageModel;

// API Keys only - provider configs (api url) moved to src/providers/image/
export const WORKER_API_KEY = process.env.WORKER_API_KEY || "";
export const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || "";
export const GOOGLE_COOKIE = process.env.GOOGLE_COOKIE || "";

// Debug Mode
export const DEBUG = process.env.DEBUG === "true";

// MinIO Object Storage Configuration
export const MINIO_ENABLED = process.env.MINIO_ENABLED === "true";
export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "";
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "";
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "";
export const MINIO_BUCKET = process.env.MINIO_BUCKET || "finished-videos";
export const MINIO_REGION = process.env.MINIO_REGION || "us-east-1";

