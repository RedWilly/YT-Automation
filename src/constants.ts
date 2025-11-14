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
export const WORDS_PER_SEGMENT = 110;
export const POLL_INTERVAL_MS = 15000; // 15 seconds when usinng flux or turbo you can use 10000=10second
export const MAX_POLL_ATTEMPTS = 60; // 10 minutes max

// Video Generation Configuration
export const IMAGES_PER_CHUNK = 8; // Number of images to process per chunk (prevents memory exhaustion - ffmpeg)

// AI Image Generation Configuration
export const USE_AI_IMAGE = process.env.USE_AI_IMAGE === "true";
export const WORKER_API_URL = process.env.WORKER_API_URL || "https://image-api.charlesattoh3.workers.dev/";
export const WORKER_API_KEY = process.env.WORKER_API_KEY || "";
export const AI_IMAGE_STYLE = "in the style of a cinematic propaganda oil painting, mid-20th century illustration, painterly brush strokes, soft diffused lighting through windows, warm desaturated tones, storytelling composition, vintage printed texture, subtle grain, dramatic sunlight and shadow, nostalgic atmosphere, no text, no words, no letters, no captions";

// Debug Mode
export const DEBUG = process.env.DEBUG === "true";

