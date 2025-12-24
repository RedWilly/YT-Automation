/**
 * Telegram Bot Client
 * Singleton pattern for Telegram bot instance with access control
 */

import { Telegraf, type Context } from "telegraf";
import { TELEGRAM } from "../../config/environment.ts";
import * as logger from "../logger.ts";

// Get config values
const TELEGRAM_BOT_TOKEN = TELEGRAM.botToken;
const ALLOWED_CHAT_IDS = TELEGRAM.allowedChatIds;
const ALLOWED_USER_IDS = TELEGRAM.allowedUserIds;

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
            // for longer video ( 1hr+)
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
                const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? "unknown";
                logger.warn(
                    "Telegram",
                    `Blocked update from ${username} (user ${String(userId ?? "unknown")}) in chat ${String(chatId ?? "unknown")}`
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
 * Type export for Context
 */
export type { Context };
