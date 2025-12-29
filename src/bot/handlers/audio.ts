/**
 * Audio message handlers
 * Handles voice, audio, and document (audio) messages
 */

import type { Context } from "../../utils/telegram/index.ts";
import { jobQueue } from "../../core/queue/index.ts";
import { parseStyleFromCaption } from "../utils.ts";
import * as logger from "../../utils/logger.ts";

/**
 * Handle voice messages
 * Adds the voice file to the queue for processing
 */
export async function handleVoiceMessage(ctx: Context): Promise<void> {
    logger.log("Bot", "Received voice message");

    if (!ctx.message || !("voice" in ctx.message)) {
        logger.debug("Bot", "Invalid voice message structure");
        return;
    }

    const voice = ctx.message.voice;
    logger.debug("Bot", `Processing voice file: ${voice.file_id}`);

    // Parse style from caption
    const style = parseStyleFromCaption(ctx);

    // Add to queue with style
    const job = jobQueue.addFileJob(ctx, voice.file_id, "voice.ogg", style);
    const position = jobQueue.getQueuePosition(job.id);
    const styleInfo = style ? `\n🎨 Style: ${style.name}` : "";

    if (position > 1) {
        await ctx.reply(
            `📋 *Job added to queue*\n\n` +
            `🔢 Position: ${position}\n` +
            `🎙️ Type: Voice message${styleInfo}\n\n` +
            `Use /queue to check status.`,
            { parse_mode: "Markdown" }
        );
    }
}

/**
 * Handle audio messages
 * Adds the audio file to the queue for processing
 */
export async function handleAudioMessage(ctx: Context): Promise<void> {
    logger.log("Bot", "Received audio message");

    if (!ctx.message || !("audio" in ctx.message)) {
        logger.debug("Bot", "Invalid audio message structure");
        return;
    }

    const audio = ctx.message.audio;
    const filename = audio.file_name || `audio_${Date.now()}.mp3`;
    logger.debug("Bot", `Processing audio file: ${filename} (${audio.file_id})`);

    // Parse style from caption
    const style = parseStyleFromCaption(ctx);

    // Add to queue with style
    const job = jobQueue.addFileJob(ctx, audio.file_id, filename, style);
    const position = jobQueue.getQueuePosition(job.id);
    const styleInfo = style ? `\n🎨 Style: ${style.name}` : "";

    if (position > 1) {
        await ctx.reply(
            `📋 *Job added to queue*\n\n` +
            `🔢 Position: ${position}\n` +
            `🎵 File: ${filename}${styleInfo}\n\n` +
            `Use /queue to check status.`,
            { parse_mode: "Markdown" }
        );
    }
}

/**
 * Handle document messages (audio files sent as documents)
 * Adds the audio document to the queue for processing
 */
export async function handleDocumentMessage(ctx: Context): Promise<void> {
    logger.log("Bot", "Received document message");

    if (!ctx.message || !("document" in ctx.message)) {
        logger.debug("Bot", "Invalid document message structure");
        return;
    }

    const document = ctx.message.document;
    const mimeType = document.mime_type || "";
    const filename = document.file_name || `document_${Date.now()}`;

    logger.debug("Bot", `Document MIME type: ${mimeType}, filename: ${filename}`);

    // Check if it's an audio file
    const isAudio = mimeType.startsWith("audio/") ||
        filename.match(/\.(mp3|wav|ogg|m4a|aac|flac|wma|opus)$/i);

    if (!isAudio) {
        logger.debug("Bot", "Document is not an audio file, ignoring");
        await ctx.reply("⚠️ Please send an audio file (mp3, wav, ogg, etc.)");
        return;
    }

    logger.debug("Bot", `Processing audio document: ${filename} (${document.file_id})`);

    // Parse style from caption
    const style = parseStyleFromCaption(ctx);

    // Add to queue with style
    const job = jobQueue.addFileJob(ctx, document.file_id, filename, style);
    const position = jobQueue.getQueuePosition(job.id);
    const styleInfo = style ? `\n🎨 Style: ${style.name}` : "";

    if (position > 1) {
        await ctx.reply(
            `📋 *Job added to queue*\n\n` +
            `🔢 Position: ${position}\n` +
            `📄 File: ${filename}${styleInfo}\n\n` +
            `Use /queue to check status.`,
            { parse_mode: "Markdown" }
        );
    }
}
