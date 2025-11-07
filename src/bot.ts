/**
 * Telegram bot for YouTube automation workflow
 */

import { Telegraf } from "telegraf";
import { TELEGRAM_BOT_TOKEN, TMP_AUDIO_DIR } from "./constants.ts";
import { transcribeAudio } from "./services/assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./services/transcript.ts";
import { generateImageQueries, validateImageQueries } from "./services/deepseek.ts";
import {
  downloadImagesForQueries,
  validateDownloadedImages,
} from "./services/images.ts";
import { generateVideo, validateVideoInputs } from "./services/video.ts";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Context } from "telegraf";
import * as logger from "./logger.ts";

/**
 * Create and configure the Telegram bot
 * @returns Configured Telegraf bot instance
 */
export function createBot(): Telegraf {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
  }

  const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

  // Error handling
  bot.catch((err, ctx) => {
    logger.error("Bot", "Error in bot", err);
    ctx.reply(`❌ An error occurred: ${err instanceof Error ? err.message : String(err)}`).catch(console.error);
  });

  // Register command handlers
  bot.command("start", handleStartCommand);
  bot.command("upload", handleUploadCommand);

  // Handle voice and audio messages - these must come before the generic message handler
  bot.on("voice", handleVoiceMessage);
  bot.on("audio", handleAudioMessage);
  bot.on("document", handleDocumentMessage);

  // Log all other messages for debugging (this should be last)
  bot.on("message", (ctx) => {
    logger.debug("Bot", "Received unhandled message type");
    if (ctx.message && "text" in ctx.message) {
      logger.debug("Bot", `Text message: ${ctx.message.text}`);
    }
  });

  return bot;
}

/**
 * Handle /start command
 */
async function handleStartCommand(ctx: Context): Promise<void> {
  await ctx.reply(
    "Welcome to YouTube Automation Bot! 🎥\n\n" +
      "Send me an audio file with the /upload command to create a video.\n\n" +
      "Usage: /upload (then send your audio file)"
  );
}

/**
 * Handle /upload command
 */
async function handleUploadCommand(ctx: Context): Promise<void> {
  await ctx.reply(
    "Please send me your audio or voice file now.\n\n" +
      "I will:\n" +
      "1. Transcribe your audio\n" +
      "2. Generate visual scenes\n" +
      "3. Find matching images\n" +
      "4. Create a video\n\n" +
      "This may take a few minutes..."
  );
}

/**
 * Handle voice messages
 */
async function handleVoiceMessage(ctx: Context): Promise<void> {
  logger.log("Bot", "Received voice message");

  if (!ctx.message || !("voice" in ctx.message)) {
    logger.debug("Bot", "Invalid voice message structure");
    return;
  }

  const voice = ctx.message.voice;
  logger.debug("Bot", `Processing voice file: ${voice.file_id}`);

  try {
    await processAudioFile(ctx, voice.file_id, "voice.ogg");
  } catch (error) {
    logger.error("Bot", "Error in handleVoiceMessage", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle audio messages
 */
async function handleAudioMessage(ctx: Context): Promise<void> {
  logger.log("Bot", "Received audio message");

  if (!ctx.message || !("audio" in ctx.message)) {
    logger.debug("Bot", "Invalid audio message structure");
    return;
  }

  const audio = ctx.message.audio;
  const filename = audio.file_name || `audio_${Date.now()}.mp3`;
  logger.debug("Bot", `Processing audio file: ${filename} (${audio.file_id})`);

  try {
    await processAudioFile(ctx, audio.file_id, filename);
  } catch (error) {
    logger.error("Bot", "Error in handleAudioMessage", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle document messages (audio files sent as documents)
 */
async function handleDocumentMessage(ctx: Context): Promise<void> {
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

  try {
    await processAudioFile(ctx, document.file_id, filename);
  } catch (error) {
    logger.error("Bot", "Error in handleDocumentMessage", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Process audio file through the complete workflow
 */
async function processAudioFile(
  ctx: Context,
  fileId: string,
  filename: string
): Promise<void> {
  const statusMessage = await ctx.reply("⏳ Processing your audio file...");

  try {
    // Step 1: Download audio file from Telegram
    await updateStatus(ctx, statusMessage.message_id, "📥 Downloading audio file...");
    const audioFilePath = await downloadTelegramFile(ctx, fileId, filename);
    logger.step("Bot", "Audio downloaded", audioFilePath);

    // Step 2: Transcribe audio with AssemblyAI
    await updateStatus(
      ctx,
      statusMessage.message_id,
      "🎙️ Transcribing audio (this may take a few minutes)..."
    );
    const transcript = await transcribeAudio(audioFilePath);
    logger.step("Bot", "Transcription completed", `${transcript.text.substring(0, 100)}...`);

    // Validate transcript data
    validateTranscriptData(transcript.words);

    // Step 3: Process transcript into segments
    await updateStatus(ctx, statusMessage.message_id, "📝 Processing transcript...");
    const { segments, formattedTranscript } = processTranscript(transcript.words);
    logger.step("Bot", `Created ${segments.length} segments`);

    // Step 4: Generate image search queries with LLM
    await updateStatus(
      ctx,
      statusMessage.message_id,
      "🤖 Generating visual scenes with AI..."
    );
    const imageQueries = await generateImageQueries(formattedTranscript);
    validateImageQueries(imageQueries);
    logger.step("Bot", `Generated ${imageQueries.length} image queries`);

    // Validate that we have exactly one query per segment
    if (imageQueries.length !== segments.length) {
      throw new Error(
        `Mismatch: Expected ${segments.length} queries (one per segment), but got ${imageQueries.length} queries from LLM`
      );
    }
    logger.success("Bot", `Query count matches segment count (${segments.length})`);

    // Validate that timestamps match
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const query = imageQueries[i];
      if (!segment || !query) continue;

      if (query.start !== segment.start || query.end !== segment.end) {
        logger.warn(
          "Bot",
          `Timestamp mismatch at segment ${i + 1}: ` +
          `Expected [${segment.start}-${segment.end}ms], ` +
          `Got [${query.start}-${query.end}ms]`
        );
      }
    }

    // Step 5: Search and download images
    await updateStatus(
      ctx,
      statusMessage.message_id,
      `🖼️ Downloading ${imageQueries.length} images...`
    );
    const downloadedImages = await downloadImagesForQueries(imageQueries);
    validateDownloadedImages(downloadedImages);
    logger.step("Bot", `Downloaded ${downloadedImages.length} images`);

    // Step 6: Generate video with FFmpeg
    await updateStatus(ctx, statusMessage.message_id, "🎬 Creating video...");
    validateVideoInputs(downloadedImages, audioFilePath);
    const videoResult = await generateVideo(downloadedImages, audioFilePath);
    logger.step("Bot", "Video created", videoResult.videoPath);

    // Step 7: Send video back to user
    await updateStatus(ctx, statusMessage.message_id, "📤 Uploading video...");
    await ctx.replyWithVideo(
      { source: videoResult.videoPath },
      { caption: "Complete ✅" }
    );

    // Delete status message
    await ctx.deleteMessage(statusMessage.message_id);

    logger.success("Bot", "Workflow completed successfully!");
  } catch (error) {
    logger.error("Bot", "Error processing audio", error);
    await updateStatus(
      ctx,
      statusMessage.message_id,
      `❌ Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Download file from Telegram
 */
async function downloadTelegramFile(
  ctx: Context,
  fileId: string,
  filename: string
): Promise<string> {
  const file = await ctx.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file from Telegram: ${response.status}`);
  }

  const filePath = join(TMP_AUDIO_DIR, filename);

  // Download and save file
  if (response.body) {
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body as any, fileStream);
  } else {
    throw new Error("No response body from Telegram file download");
  }

  return filePath;
}

/**
 * Update status message
 */
async function updateStatus(
  ctx: Context,
  messageId: number,
  text: string
): Promise<void> {
  try {
    await ctx.telegram.editMessageText(ctx.chat?.id, messageId, undefined, text);
  } catch (error) {
    // Ignore errors if message is the same
    logger.debug("Bot", `Could not update status message: ${error}`);
  }
}

/**
 * Start the bot
 */
export async function startBot(): Promise<void> {
  logger.log("Bot", "Initializing bot...");
  logger.debug("Bot", `Token loaded: ${TELEGRAM_BOT_TOKEN ? "✓" : "✗"}`);
  logger.debug("Bot", `Token length: ${TELEGRAM_BOT_TOKEN.length} characters`);

  const bot = createBot();

  logger.log("Bot", "Starting Telegram bot...");

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  await bot.launch();

  logger.success("Bot", "Bot is running! Send /start to begin.");
  logger.log("Bot", "Listening for voice and audio messages...");
}

