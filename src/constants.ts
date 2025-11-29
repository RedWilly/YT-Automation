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

// Processing Configuration
export const POLL_INTERVAL_MS = 2200; // 2.2 seconds between poll attempts
export const MAX_POLL_ATTEMPTS = 60; // 10 minutes max

// Video Generation Configuration
export const IMAGES_PER_CHUNK = 8; // Number of images to process per chunk (prevents memory exhaustion - ffmpeg)
export const PAN_EFFECT = process.env.PAN_EFFECT === "true"; // Enable subtle vertical pan effect on images
export const CAPTIONS_ENABLED = process.env.CAPTIONS_ENABLED === "true"; // Enable word-by-word highlighted captions

// AI Image Generation Configuration
export const USE_AI_IMAGE = process.env.USE_AI_IMAGE === "true";
export const WORKER_API_URL = process.env.WORKER_API_URL || "";
export const WORKER_API_KEY = process.env.WORKER_API_KEY || "";
export const AI_IMAGE_STYLE = process.env.AI_IMAGE_STYLE || "";

// AI Image Model Provider Configuration
export type AIImageModel = "cloudflare" | "togetherai";
export const AI_IMAGE_MODEL = (process.env.AI_IMAGE_MODEL) as AIImageModel;
export const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || "";

// Together AI Configuration
export const TOGETHER_API_URL = "https://api.together.xyz/v1/images/generations";
export const TOGETHER_MODEL = "black-forest-labs/FLUX.1-schnell-Free";
export const TOGETHER_RATE_LIMIT_PER_MIN = 6; // FLUX.1 [schnell] Free has 6 img/min limit
export const TOGETHER_MIN_DELAY_MS = 60000 / TOGETHER_RATE_LIMIT_PER_MIN; // ~10000ms minimum between requests

// Debug Mode
export const DEBUG = process.env.DEBUG === "true";

// MinIO Object Storage Configuration
export const MINIO_ENABLED = process.env.MINIO_ENABLED === "true";
export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "";
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "";
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "";
export const MINIO_BUCKET = process.env.MINIO_BUCKET || "finished-videos";
export const MINIO_REGION = process.env.MINIO_REGION || "us-east-1";

