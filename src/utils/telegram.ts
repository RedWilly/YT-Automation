/**
 * Telegram utility - Singleton pattern for Telegram bot instance
 * Centralizes all Telegram-related functionality
 */

import { Telegraf, type Context } from "telegraf";
import { TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_IDS, ALLOWED_USER_IDS } from "../constants.ts";
import * as logger from "../logger.ts";

// Singleton instance
let botInstance: Telegraf | null = null;

/**
 * Get or create the Telegram bot instance (singleton)
 * @returns Telegraf bot instance
 */
export function getTelegramBot(): Telegraf {
  if (!botInstance) {
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
    }

    botInstance = new Telegraf(TELEGRAM_BOT_TOKEN, {
      // Fix timeout error: Set handler timeout to 14 hours (50400 seconds)
      // This prevents "Promise timed out after 90000 milliseconds" errors
      // when processing long-running workflows (transcription, image generation, video rendering)
      //for longer video ( 1hr+)
      handlerTimeout: 50_400_000, // 14 hours
    });
    logger.debug("Telegram", "Bot instance created with 14-hour handler timeout");

    // Access control middleware: only allow updates from allowed users/chats when set
    botInstance.use(async (ctx: Context, next) => {
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;

      const hasUserAllowlist = ALLOWED_USER_IDS.length > 0;
      const hasChatAllowlist = ALLOWED_CHAT_IDS.length > 0;

      let authorized = true;
      if (hasUserAllowlist || hasChatAllowlist) {
        authorized = false;
        if (hasChatAllowlist && typeof chatId === "number" && ALLOWED_CHAT_IDS.includes(chatId)) {
          authorized = true;
        }
        if (!authorized && hasUserAllowlist && typeof userId === "number" && ALLOWED_USER_IDS.includes(userId)) {
          authorized = true;
        }
      }

      if (!authorized) {
        logger.warn(
          "Telegram",
          `Blocked update from user ${String(userId ?? "unknown")} in chat ${String(chatId ?? "unknown")}`
        );
        return; // Drop silently
      }

      return await next();
    });
  }

  return botInstance;
}

/**
 * Send a message to a chat
 * @param chatId - Chat ID
 * @param text - Message text
 * @param options - Optional message options
 * @returns Message result
 */
export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: { parse_mode?: "Markdown" | "HTML" }
): Promise<any> {
  const bot = getTelegramBot();
  return await bot.telegram.sendMessage(chatId, text, options);
}

/**
 * Edit a message
 * @param chatId - Chat ID
 * @param messageId - Message ID to edit
 * @param text - New message text
 * @param options - Optional message options
 * @returns Edit result
 */
export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: { parse_mode?: "Markdown" | "HTML" }
): Promise<any> {
  const bot = getTelegramBot();
  return await bot.telegram.editMessageText(chatId, messageId, undefined, text, options);
}

/**
 * Delete a message
 * @param chatId - Chat ID
 * @param messageId - Message ID to delete
 * @returns Delete result
 */
export async function deleteMessage(
  chatId: number | string,
  messageId: number
): Promise<boolean> {
  const bot = getTelegramBot();
  return await bot.telegram.deleteMessage(chatId, messageId);
}

/**
 * Get file URL from Telegram
 * @param fileId - File ID
 * @returns File URL
 */
export async function getFileUrl(fileId: string): Promise<string> {
  const bot = getTelegramBot();
  const file = await bot.telegram.getFile(fileId);
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
}

/**
 * Download file from Telegram
 * @param fileId - Telegram file ID
 * @param filename - Filename to save as
 * @param tmpDir - Directory to save file in
 * @returns Path to downloaded file
 */
export async function downloadTelegramFile(
  fileId: string,
  filename: string,
  tmpDir: string
): Promise<string> {
  const { createWriteStream, existsSync } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const { join } = await import("node:path");
  const { mkdir } = await import("node:fs/promises");

  // Ensure directory exists
  await mkdir(tmpDir, { recursive: true });

  const filePath = join(tmpDir, filename);

  // Check if file already exists - skip download if it does
  if (existsSync(filePath)) {
    logger.log("Telegram", `File already exists, skipping download: ${filename}`);
    return filePath;
  }

  const fileUrl = await getFileUrl(fileId);

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file from Telegram: ${response.status}`);
  }

  // Download and save file
  if (response.body) {
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body as any, fileStream);
  } else {
    throw new Error("No response body from Telegram file download");
  }

  logger.success("Telegram", `Downloaded file: ${filename}`);
  return filePath;
}

/**
 * Extract filename from URL path (for pre-download existence check)
 * @param url - URL to extract filename from
 * @returns Sanitized filename or fallback
 */
export function extractFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    let urlFilename = pathParts[pathParts.length - 1] || "";

    // Remove query parameters
    urlFilename = urlFilename.split("?")[0] || "";

    // Sanitize
    urlFilename = urlFilename.replace(/[<>:"|?*\/\\]/g, "_");

    // Check if valid audio filename
    const hasAudioExt = /\.(mp3|wav|ogg|m4a|aac|flac|wma|opus)$/i.test(urlFilename);
    if (urlFilename.length > 0 && urlFilename.length < 255 && hasAudioExt) {
      return urlFilename;
    }
  } catch {
    // URL parsing failed
  }

  // Fallback: generate timestamp-based filename
  return `audio_url_${Date.now()}.mp3`;
}

/**
 * Extract filename from Content-Disposition header or URL
 * @param response - Fetch response object
 * @param url - Original URL
 * @returns Sanitized filename
 */
export function extractFilenameFromResponse(response: Response, url: string): string {
  // Try to get filename from Content-Disposition header (like browsers do)
  const contentDisposition = response.headers.get("content-disposition");
  if (contentDisposition) {
    // Match filename="..." or filename*=UTF-8''...
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=["']?([^"'\n;]+)["']?/i);
    const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);

    let filename = filenameStarMatch?.[1] || filenameMatch?.[1];

    if (filename) {
      // Decode URI encoding if present
      try {
        filename = decodeURIComponent(filename);
      } catch {
        // If decoding fails, use as-is
      }

      // Sanitize the filename for filesystem safety
      filename = filename.replace(/[<>:"|?*\/\\]/g, "_");

      // Check if it has an audio extension
      const hasAudioExt = /\.(mp3|wav|ogg|m4a|aac|flac|wma|opus)$/i.test(filename);
      if (hasAudioExt && filename.length < 255) {
        return filename;
      }
    }
  }

  // Fallback: try to extract from URL path
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");
  let urlFilename = pathParts[pathParts.length - 1] || "";

  // Remove query parameters
  urlFilename = urlFilename.split("?")[0] || "";

  // Sanitize
  urlFilename = urlFilename.replace(/[<>:"|?*\/\\]/g, "_");

  // Check if valid
  const hasAudioExt = /\.(mp3|wav|ogg|m4a|aac|flac|wma|opus)$/i.test(urlFilename);
  if (urlFilename.length > 0 && urlFilename.length < 255 && hasAudioExt) {
    return urlFilename;
  }

  // Last resort: generate timestamp-based filename
  const timestamp = Date.now();
  return `audio_url_${timestamp}.mp3`;
}

/**
 * Download audio file from a URL (e.g., Cloudflare R2, S3 presigned URL)
 * @param url - URL to download from
 * @param tmpDir - Directory to save file in
 * @returns Path to downloaded file
 */
export async function downloadAudioFromUrl(url: string, tmpDir: string): Promise<string> {
  const { createWriteStream, existsSync } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const { join } = await import("node:path");
  const { mkdir } = await import("node:fs/promises");

  logger.log("Telegram", `Processing audio from URL: ${url}`);

  // Ensure the directory exists
  await mkdir(tmpDir, { recursive: true });

  // First, extract expected filename from URL to check if file exists
  // We need to make a HEAD request or parse the URL to get the filename
  const urlFilename = extractFilenameFromUrl(url);
  const expectedFilePath = join(tmpDir, urlFilename);

  // Check if file already exists - skip download if it does
  if (existsSync(expectedFilePath)) {
    logger.log("Telegram", `File already exists, skipping download: ${urlFilename}`);
    return expectedFilePath;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file from URL: ${response.status} ${response.statusText}`);
  }

  // Extract filename from response headers or URL (like browsers do)
  const filename = extractFilenameFromResponse(response, url);
  const filePath = join(tmpDir, filename);

  // Check again with the actual filename from response headers
  if (existsSync(filePath)) {
    logger.log("Telegram", `File already exists, skipping download: ${filename}`);
    return filePath;
  }

  logger.debug("Telegram", `Saving audio to: ${filePath}`);

  // Download and save file
  if (response.body) {
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body as any, fileStream);
  } else {
    throw new Error("No response body from URL download");
  }

  logger.success("Telegram", `Audio downloaded from URL: ${filePath}`);
  return filePath;
}

/**
 * Type export for Context
 */
export type { Context };

