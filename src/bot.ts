/**
 * Telegram bot for YouTube automation workflow
 */

import { getTelegramBot, getFileUrl, type Context } from "./utils/telegram.ts";
import { TMP_AUDIO_DIR } from "./constants.ts";
import { transcribeAudio } from "./services/assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./services/transcript.ts";
import { generateImageQueries, validateImageQueries } from "./services/deepseek.ts";
import {
  downloadImagesForQueries,
  validateDownloadedImages,
} from "./services/images.ts";
import { generateVideo, validateVideoInputs } from "./services/video.ts";
import { uploadToYouTube } from "./services/youtube.ts";
import { cleanupTempFiles } from "./services/cleanup.ts";
import { ProgressTracker } from "./services/progress.ts";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import * as logger from "./logger.ts";

/**
 * Create and configure the Telegram bot
 * @returns Configured Telegraf bot instance
 */
export function createBot() {
  const bot = getTelegramBot();

  // Error handling
  bot.catch((err: any, ctx: Context) => {
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
      "Send me an audio file to automatically:\n" +
      "1. 🎙️ Transcribe your audio\n" +
      "2. 🤖 Generate visual scenes with AI\n" +
      "3. 🖼️ Download matching images\n" +
      "4. 🎬 Create a video\n" +
      "5. 📤 Upload to YouTube (private)\n\n" +
      "Just send your audio file to get started!"
  );
}

/**
 * Handle /upload command
 */
async function handleUploadCommand(ctx: Context): Promise<void> {
  await ctx.reply(
    "Please send me your audio or voice file now.\n\n" +
      "I will:\n" +
      "1. 🎙️ Transcribe your audio\n" +
      "2. 🤖 Generate visual scenes\n" +
      "3. 🖼️ Download matching images\n" +
      "4. 🎬 Create a video\n" +
      "5. 📤 Upload to YouTube (private)\n\n" +
      "This may take a few minutes... I'll keep you updated!"
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
  // Initialize progress tracker
  const progress = new ProgressTracker(ctx);
  await progress.start("🎙️ Audio received, starting processing...");

  try {
    // Step 1: Download audio file from Telegram
    await progress.update({
      step: "Downloading Audio",
      message: "Downloading audio file from Telegram...",
    });
    const audioFilePath = await downloadTelegramFile(fileId, filename);
    logger.step("Bot", "Audio downloaded", audioFilePath);

    // Step 2: Transcribe audio with AssemblyAI
    await progress.update({
      step: "Transcription",
      message: "Transcribing audio with AssemblyAI...\nThis may take a few minutes.",
    });
    const transcript = await transcribeAudio(audioFilePath);
    logger.step("Bot", "Transcription completed", `${transcript.text.substring(0, 100)}...`);

    // Validate transcript data
    validateTranscriptData(transcript.words);

    // Step 3: Process transcript into segments
    await progress.update({
      step: "Processing Transcript",
      message: "Segmenting transcript into scenes...",
    });
    const { segments, formattedTranscript } = processTranscript(transcript.words);
    logger.step("Bot", `Created ${segments.length} segments`);

    // Step 4: Generate image search queries with LLM
    await progress.update({
      step: "Generating Image Queries",
      message: "Using AI to generate visual scene descriptions...",
    });
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
    await progress.update({
      step: "Downloading Images",
      message: `Searching and downloading ${imageQueries.length} images...`,
      current: 0,
      total: imageQueries.length,
    });
    const downloadedImages = await downloadImagesForQueries(imageQueries);
    validateDownloadedImages(downloadedImages);
    logger.step("Bot", `Downloaded ${downloadedImages.length} images`);

    // Step 6: Generate video with FFmpeg
    await progress.update({
      step: "Generating Video",
      message: "Creating video with FFmpeg...\nThis may take a few minutes for long videos.",
    });
    validateVideoInputs(downloadedImages, audioFilePath);
    const videoResult = await generateVideo(downloadedImages, audioFilePath);
    logger.step("Bot", "Video created", videoResult.videoPath);

    // Step 7: Upload to YouTube
    await progress.update({
      step: "Uploading to YouTube",
      message: "Uploading video to YouTube as private...",
    });

    // Generate video title from filename or use default
    const videoTitle = `Automated Video - ${new Date().toLocaleDateString()}`;
    const uploadResult = await uploadToYouTube(videoResult.videoPath, {
      title: videoTitle,
      description: "Automatically generated video from audio transcription",
      tags: ["automation", "ai-generated"],
    });
    logger.step("Bot", "Video uploaded to YouTube", uploadResult.videoUrl);

    // Step 8: Cleanup temporary files
    await progress.update({
      step: "Cleanup",
      message: "Cleaning up temporary files...",
    });
    await cleanupTempFiles(false); // Delete everything including final video
    logger.step("Bot", "Cleanup completed");

    // Step 9: Send completion message with YouTube URL
    await progress.complete("Video uploaded successfully!", uploadResult.videoUrl);

    logger.success("Bot", "Workflow completed successfully!");
  } catch (error) {
    logger.error("Bot", "Error processing audio", error);
    await progress.error(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Download file from Telegram
 */
async function downloadTelegramFile(
  fileId: string,
  filename: string
): Promise<string> {
  const fileUrl = await getFileUrl(fileId);

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
 * Start the bot
 */
export async function startBot(): Promise<void> {
  logger.log("Bot", "Initializing bot...");

  const bot = createBot();

  logger.log("Bot", "Starting Telegram bot...");

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  await bot.launch();

  logger.success("Bot", "Bot is running! Send /start to begin.");
  logger.log("Bot", "Listening for voice and audio messages...");
}

