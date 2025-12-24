/**
 * /url command handler
 */

import type { Context } from "../../utils/telegram/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import { parseStyleFromMessage, getStyle, getDefaultStyle, resolveStyle } from "../../styles/index.ts";
import { jobQueue } from "../../core/queue/index.ts";
import { waitingForUrl } from "../utils.ts";
import * as logger from "../../utils/logger.ts";

/**
 * Handle URL input from user
 * Adds the URL job to the queue for processing
 * @param ctx - Telegram context
 * @param url - Audio file URL
 * @param style - Optional resolved style configuration
 */
export async function handleUrlInput(ctx: Context, url: string, style?: ResolvedStyle): Promise<void> {
    logger.log("Bot", `Received URL input: ${url}`);

    // Validate URL format
    try {
        new URL(url);
    } catch {
        await ctx.reply("❌ Invalid URL format. Please provide a valid HTTP/HTTPS URL.");
        return;
    }

    // Add to queue with style
    const job = jobQueue.addUrlJob(ctx, url, style);
    const position = jobQueue.getQueuePosition(job.id);
    const styleInfo = style ? `\n🎨 Style: ${style.name}` : "";

    if (position > 1) {
        await ctx.reply(
            `📋 *Job added to queue*\n\n` +
            `🔢 Position: ${position}\n` +
            `📎 Type: URL${styleInfo}\n\n` +
            `Use /queue to check status.`,
            { parse_mode: "Markdown" }
        );
    }
    // If position is 1, it will start immediately and the workflow will notify
}

/**
 * Handle /url command
 * Prompts user to provide a presigned URL for large audio files
 * Supports style parsing from command text
 */
export async function handleUrlCommand(ctx: Context): Promise<void> {
    logger.log("Bot", "Received /url command");

    if (!ctx.chat) {
        logger.error("Bot", "No chat context available");
        return;
    }

    // Parse style from command text
    let style: ResolvedStyle | undefined;
    let urlFromCommand: string | undefined;

    if (ctx.message && "text" in ctx.message) {
        const text = ctx.message.text;

        // Parse style from the command text
        const { styleId, options } = parseStyleFromMessage(text);
        const baseStyle = getStyle(styleId) ?? getDefaultStyle();
        style = resolveStyle(baseStyle, options);

        // Extract URL (anything that looks like a URL)
        const urlMatch = text.match(/https?:\/\/[^\s]+/i);
        if (urlMatch) {
            urlFromCommand = urlMatch[0];
        }
    }

    // If URL was found in command, process immediately
    if (urlFromCommand) {
        logger.log("Bot", "URL provided as command argument");
        await handleUrlInput(ctx, urlFromCommand, style);
        return;
    }

    // No URL provided, enter waiting state with style
    const chatId = ctx.chat.id;
    waitingForUrl.set(chatId, { style });

    const styleInfo = style ? `\n🎨 Style: ${style.name}` : "";

    await ctx.reply(
        "📎 Please send me a presigned URL to your audio file.\n\n" +
        "This is useful for large files (>20MB) that can't be uploaded directly to Telegram.\n\n" +
        "Supported sources:\n" +
        "   • Cloudflare R2 presigned URLs\n" +
        "   • AWS S3 presigned URLs\n" +
        "   • MinIO presigned URLs\n" +
        "   • Any direct download URL\n\n" +
        "Just paste the URL in your next message." + styleInfo + "\n\n" +
        "💡 Tip: You can also use `/url <your-url> #style` in one message."
    );
}
