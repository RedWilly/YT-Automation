/**
 * /start command handler
 */

import type { Context } from "../../utils/telegram/index.ts";
import { AI_TEXT } from "../../config/index.ts";
import { getDefaultStyle, getStyleIds } from "../../styles/index.ts";

/**
 * Handle /start command
 * Shows welcome message with bot capabilities
 */
export async function handleStartCommand(ctx: Context): Promise<void> {
    const imageMode = AI_TEXT.useAiImage ? "🎨 AI Generation" : "🔍 Web Search";
    const defaultStyle = getDefaultStyle();
    const availableStyles = getStyleIds().join(", ");

    await ctx.reply(
        "Welcome to YouTube Automation Bot! 🎥\n\n" +
        "Send me an audio file to automatically:\n" +
        "1. 🎙️ Transcribe your audio\n" +
        "2. 🤖 Generate visual scenes with AI\n" +
        "3. 🖼️ Get matching images\n" +
        "4. 🎬 Create a video\n" +
        "5. 💾 Save video locally\n\n" +
        `📊 Settings:\n` +
        `   • Image source: ${imageMode}\n` +
        `   • Default style: ${defaultStyle.name}\n\n` +
        "🎨 Style Selection:\n" +
        `   • Available: ${availableStyles}\n` +
        "   • Use #style in caption (e.g., #ww2)\n" +
        "   • Options: --pan, --no-pan, --karaoke, --no-karaoke, --short\n\n" +
        "📝 Commands:\n" +
        "   • /upload - Upload audio via Telegram (max 20MB)\n" +
        "   • /url - Provide a presigned URL for large files\n" +
        "   • /queue - View pending jobs in the queue\n" +
        "   • /styles - View available video styles\n" +
        "   • /help - Show detailed help\n" +
        "   • /cleanup - Remove all temporary files\n\n" +
        "Just send your audio file to get started!"
    );
}
