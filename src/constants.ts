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
export const INCLUDE_DISCLAIMER = process.env.INCLUDE_DISCLAIMER === "true";
export const DISCLAIMER_VIDEO_PATH = "asset/start.mov";

// AI Image Generation Configuration
export const USE_AI_IMAGE = process.env.USE_AI_IMAGE === "true";
export const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || "";
export const AI_IMAGE_STYLE = "in the style of a cinematic propaganda oil painting, mid-20th century illustration, painterly brush strokes, soft diffused lighting through windows, warm desaturated tones, storytelling composition, vintage printed texture, subtle grain, dramatic sunlight and shadow, nostalgic atmosphere, no text, no words, no letters, no captions";
export const AI_IMAGE_MODEL = "gptimage"; // Options: flux, kontext, turbo, gptimage
export const AI_IMAGE_WIDTH = 1920;
export const AI_IMAGE_HEIGHT = 1080;
export const AI_IMAGE_ASPECT = "16:9"; // For gptimage model only (options: 1:1, 16:9, 9:16, 4:3, 3:4)
export const AI_IMAGE_NOLOGO = true; // thus when enabled removes pollinations watermarks

// YouTube API Configuration
export const YOUTUBE_AUTO_POST = process.env.YOUTUBE_AUTO_POST === "true";
export const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "";
export const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "";
export const YOUTUBE_DEFAULT_CHANNEL = process.env.YOUTUBE_DEFAULT_CHANNEL || "";

// Mossad Channel (Default)
export const YOUTUBE_MOSSAD_ACCESS_TOKEN = process.env.YOUTUBE_MOSSAD_ACCESS_TOKEN || "";
export const YOUTUBE_MOSSAD_REFRESH_TOKEN = process.env.YOUTUBE_MOSSAD_REFRESH_TOKEN || "";
export const YOUTUBE_MOSSAD_CHANNEL_ID = process.env.YOUTUBE_MOSSAD_CHANNEL_ID || "";

// Blind Spot Channel
export const YOUTUBE_BLINDSPOT_ACCESS_TOKEN = process.env.YOUTUBE_BLINDSPOT_ACCESS_TOKEN || "";
export const YOUTUBE_BLINDSPOT_REFRESH_TOKEN = process.env.YOUTUBE_BLINDSPOT_REFRESH_TOKEN || "";
export const YOUTUBE_BLINDSPOT_CHANNEL_ID = process.env.YOUTUBE_BLINDSPOT_CHANNEL_ID || "";

// Debug Mode
export const DEBUG = process.env.DEBUG === "true";

