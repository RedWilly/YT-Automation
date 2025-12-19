/**
 * /upload command handler
 */

import type { Context } from "../../utils/telegram/index.ts";
import { AI_TEXT } from "../../config/index.ts";

/**
 * Handle /upload command
 * Prompts user to send an audio file
 */
export async function handleUploadCommand(ctx: Context): Promise<void> {
    await ctx.reply(
        "Please send me your audio or voice file now.\n\n" +
        "I will:\n" +
        "1. 🎙️ Transcribe your audio\n" +
        "2. 🤖 Generate visual scenes\n" +
        `3. 🖼️ ${AI_TEXT.useAiImage ? "Generate AI images" : "Search for images online"}\n` +
        "4. 🎬 Create a video\n" +
        "5. 💾 Save video locally\n\n" +
        "This may take a few minutes... I'll keep you updated!"
    );
}
