/**
 * Telegram utility - Singleton pattern for Telegram bot instance
 * Centralizes all Telegram-related functionality
 */

import { Telegraf, type Context } from "telegraf";
import { TELEGRAM_BOT_TOKEN } from "../constants.ts";
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

    botInstance = new Telegraf(TELEGRAM_BOT_TOKEN);
    logger.debug("Telegram", "Bot instance created");
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
 * Type export for Context
 */
export type { Context };

