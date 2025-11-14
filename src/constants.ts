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
export const POLL_INTERVAL_MS = 2000; // 5 seconds between poll attempts
export const MAX_POLL_ATTEMPTS = 60; // 10 minutes max

// Video Generation Configuration
export const IMAGES_PER_CHUNK = 8; // Number of images to process per chunk (prevents memory exhaustion - ffmpeg)
export const PAN_EFFECT = process.env.PAN_EFFECT === "true"; // Enable subtle vertical pan effect on images
export const CAPTIONS_ENABLED = process.env.CAPTIONS_ENABLED === "true"; // Enable word-by-word highlighted captions

// AI Image Generation Configuration
export const USE_AI_IMAGE = process.env.USE_AI_IMAGE === "true";
export const WORKER_API_URL = process.env.WORKER_API_URL || "";
export const WORKER_API_KEY = process.env.WORKER_API_KEY || "";
export const AI_IMAGE_STYLE = "in the style of minimalist editorial ink and watercolor illustration, clean precise ink outlines, subtle translucent watercolor washes, limited muted color palette, airy composition, flat yet realistic shading, infographic-style clarity, modern minimalistic storytelling, elegant and uncluttered visual design, soft diffused sunlight";

// Debug Mode
export const DEBUG = process.env.DEBUG === "true";

// MinIO Object Storage Configuration
export const MINIO_ENABLED = process.env.MINIO_ENABLED === "true";
export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "";
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "";
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "";
export const MINIO_BUCKET = process.env.MINIO_BUCKET || "finished-videos";
export const MINIO_REGION = process.env.MINIO_REGION || "us-east-1";

