/**
 * Application constants and environment variables
 */

// Telegram Bot Configuration
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// AssemblyAI Configuration
export const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || "";

// DeepSeek LLM Configuration
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL;
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "";

// Directory Paths
export const TMP_AUDIO_DIR = "tmp/audio";
export const TMP_IMAGES_DIR = "tmp/images";
export const TMP_VIDEO_DIR = "tmp/video";

// Processing Configuration
export const WORDS_PER_SEGMENT = 100;
export const POLL_INTERVAL_MS = 10000; // 10 seconds
export const MAX_POLL_ATTEMPTS = 60; // 10 minutes max

// Video Generation Configuration
export const IMAGES_PER_CHUNK = 15; // Number of images to process per chunk (prevents memory exhaustion)

// Debug Mode
export const DEBUG = process.env.DEBUG === "true";

