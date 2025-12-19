/**
 * /queue command handler
 */

import type { Context } from "../../utils/telegram/index.ts";
import { jobQueue } from "../../core/queue/index.ts";
import * as logger from "../../utils/logger.ts";

/**
 * Handle /queue command
 * Shows the current job queue status
 */
export async function handleQueueCommand(ctx: Context): Promise<void> {
    logger.log("Bot", "Received /queue command");

    if (!ctx.chat) {
        logger.error("Bot", "No chat context available");
        return;
    }

    const chatId = ctx.chat.id;
    const queueStatus = jobQueue.formatQueueStatus(chatId);

    await ctx.reply(queueStatus, { parse_mode: "MarkdownV2" });
}
