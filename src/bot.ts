/**
 * Telegram bot for YouTube automation workflow
 */

import {
  getTelegramBot,
  downloadTelegramFile,
  downloadAudioFromUrl,
  type Context,
} from "./utils/telegram.ts";
import { TMP_AUDIO_DIR, USE_AI_IMAGE, MINIO_ENABLED, CAPTIONS_ENABLED } from "./constants.ts";
import { transcribeAudio } from "./services/assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./services/transcript.ts";
import { generateImageQueries, validateImageQueries } from "./services/deepseek.ts";
import {
  downloadImagesForQueries,
  validateDownloadedImages,
} from "./services/images.ts";
import { generateVideo, validateVideoInputs } from "./services/video.ts";
import { cleanupTempFiles } from "./services/cleanup.ts";
import { uploadVideoToMinIO } from "./services/minio.ts";
import { generateCaptions } from "./services/captions.ts";
import { ProgressTracker } from "./services/progress.ts";
import * as logger from "./logger.ts";

/**
 * State management for tracking users waiting to provide URLs
 */
const waitingForUrl = new Set<number>();

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
  bot.command("url", handleUrlCommand);
  bot.command("cleanup", handleCleanupCommand);

  // Handle voice and audio messages - these must come before the generic message handler
  bot.on("voice", handleVoiceMessage);
  bot.on("audio", handleAudioMessage);
  bot.on("document", handleDocumentMessage);

  // Handle text messages (for URL input)
  bot.on("message", async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const chatId = ctx.chat.id;
      const text = ctx.message.text;

      // Check if user is waiting to provide a URL
      if (waitingForUrl.has(chatId)) {
        waitingForUrl.delete(chatId);
        await handleUrlInput(ctx, text);
        return;
      }

      logger.debug("Bot", `Unhandled text message: ${text}`);
    } else {
      logger.debug("Bot", "Received unhandled message type");
    }
  });

  return bot;
}

/**
 * Handle /start command
 */
async function handleStartCommand(ctx: Context): Promise<void> {
  const imageMode = USE_AI_IMAGE ? "🎨 AI Generation" : "🔍 Web Search";

  await ctx.reply(
    "Welcome to YouTube Automation Bot! 🎥\n\n" +
      "Send me an audio file to automatically:\n" +
      "1. 🎙️ Transcribe your audio\n" +
      "2. 🤖 Generate visual scenes with AI\n" +
      "3. 🖼️ Get matching images\n" +
      "4. 🎬 Create a video\n" +
      "5. 💾 Save video locally\n\n" +
      `📊 Settings:\n` +
      `   • Image source: ${imageMode}\n\n` +
      "📝 Commands:\n" +
      "   • /upload - Upload audio via Telegram (max 20MB)\n" +
      "   • /url - Provide a presigned URL for large files\n" +
      "   • /cleanup - Remove all temporary files\n\n" +
      "Just send your audio file to get started!"
  );
}

/**
 * Handle /upload command
 */
async function handleUploadCommand(ctx: Context): Promise<void> {
  const imageMode = USE_AI_IMAGE ? "generate AI images" : "search for images online";

  await ctx.reply(
    "Please send me your audio or voice file now.\n\n" +
      "I will:\n" +
      "1. 🎙️ Transcribe your audio\n" +
      "2. 🤖 Generate visual scenes\n" +
      `3. 🖼️ ${USE_AI_IMAGE ? "Generate AI images" : "Search for images online"}\n` +
      "4. 🎬 Create a video\n" +
      "5. 💾 Save video locally\n\n" +
      "This may take a few minutes... I'll keep you updated!"
  );
}

/**
 * Handle /cleanup command
 * Removes all temporary files from tmp/audio/, tmp/images/, and tmp/video/ directories
 */
async function handleCleanupCommand(ctx: Context): Promise<void> {
  logger.log("Bot", "Received /cleanup command");

  try {
    await ctx.reply("🧹 Starting cleanup of temporary files...");

    // Call the cleanup service
    const result = await cleanupTempFiles(false); // Don't keep final video

    // Calculate statistics
    const totalSizeMB = (result.totalSize / 1024 / 1024).toFixed(2);
    const audioFiles = result.deletedFiles.filter((f) => f.includes(TMP_AUDIO_DIR)).length;
    const imageFiles = result.deletedFiles.filter((f) => f.includes("tmp/images")).length;
    const videoFiles = result.deletedFiles.filter((f) => f.includes("tmp/video")).length;

    // Build success message
    let message = `✅ Cleanup completed successfully!\n\n`;
    message += `📊 Summary:\n`;
    message += `   • Audio files deleted: ${audioFiles}\n`;
    message += `   • Image files deleted: ${imageFiles}\n`;
    message += `   • Video files deleted: ${videoFiles}\n`;
    message += `   • Total files deleted: ${result.deletedFiles.length}\n`;
    message += `   • Space freed: ${totalSizeMB} MB\n`;

    if (result.failedFiles.length > 0) {
      message += `\n⚠️ Failed to delete ${result.failedFiles.length} files`;
    }

    await ctx.reply(message);
    logger.success("Bot", `Cleanup completed: ${result.deletedFiles.length} files deleted (${totalSizeMB} MB)`);
  } catch (error) {
    logger.error("Bot", "Error in handleCleanupCommand", error);
    await ctx.reply(`❌ Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Handle /url command
 * Prompts user to provide a presigned URL for large audio files
 * Supports both "/url" (then wait for URL) and "/url <url>" (immediate processing)
 */
async function handleUrlCommand(ctx: Context): Promise<void> {
  logger.log("Bot", "Received /url command");

  if (!ctx.chat) {
    logger.error("Bot", "No chat context available");
    return;
  }

  // Check if URL was provided as command argument: /url <url>
  if (ctx.message && "text" in ctx.message) {
    const text = ctx.message.text;
    const parts = text.split(/\s+/); // Split by whitespace

    // If there's a second part, treat it as the URL
    if (parts.length > 1 && parts[1]) {
      const url = parts.slice(1).join(" "); // Join in case URL has spaces (unlikely but possible)
      logger.log("Bot", "URL provided as command argument");
      await handleUrlInput(ctx, url);
      return;
    }
  }

  // No URL provided, enter waiting state
  const chatId = ctx.chat.id;
  waitingForUrl.add(chatId);

  await ctx.reply(
    "📎 Please send me a presigned URL to your audio file.\n\n" +
      "This is useful for large files (>20MB) that can't be uploaded directly to Telegram.\n\n" +
      "Supported sources:\n" +
      "   • Cloudflare R2 presigned URLs\n" +
      "   • AWS S3 presigned URLs\n" +
      "   • MinIO presigned URLs\n" +
      "   • Any direct download URL\n\n" +
      "Just paste the URL in your next message.\n\n" +
      "💡 Tip: You can also use `/url <your-url>` in one message."
  );
}

/**
 * Handle URL input from user
 * Downloads audio from the provided URL and processes it
 */
async function handleUrlInput(ctx: Context, url: string): Promise<void> {
  logger.log("Bot", `Received URL input: ${url}`);

  // Validate URL format
  try {
    new URL(url);
  } catch {
    await ctx.reply("❌ Invalid URL format. Please provide a valid HTTP/HTTPS URL.");
    return;
  }

  try {
    await processAudioFromUrl(ctx, url);
  } catch (error) {
    logger.error("Bot", "Error in handleUrlInput", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    const audioFilePath = await downloadTelegramFile(fileId, filename, TMP_AUDIO_DIR);
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
    const { segments, formattedTranscript } = processTranscript(transcript.words, transcript.audio_duration);
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

    // Step 6: Generate captions (if enabled)
    let assFilePath: string | undefined;
    if (CAPTIONS_ENABLED) {
      await progress.update({
        step: "Generating Captions",
        message: "Creating word-by-word highlighted captions...",
      });
      const captionResult = await generateCaptions(segments, transcript.words);
      assFilePath = captionResult.assFilePath;
      logger.step("Bot", `Captions created: ${captionResult.groups.length} groups`);
    }

    // Step 7: Generate video with FFmpeg
    await progress.update({
      step: "Generating Video",
      message: "Creating video with FFmpeg...\nThis may take a few minutes for long videos.",
    });
    validateVideoInputs(downloadedImages, audioFilePath);
    const videoResult = await generateVideo(downloadedImages, audioFilePath, assFilePath);
    logger.step("Bot", "Video created", videoResult.videoPath);

    // Step 8: Upload to MinIO (if enabled)
    if (MINIO_ENABLED) {
      await progress.update({
        step: "Uploading to MinIO",
        message: "Uploading video to MinIO object storage...",
      });
      const minioResult = await uploadVideoToMinIO(videoResult.videoPath);

      if (minioResult.success) {
        logger.success("Bot", `Video uploaded to MinIO: ${minioResult.url}`);
        videoResult.minioUpload = minioResult;
      } else {
        logger.warn("Bot", `MinIO upload failed: ${minioResult.error}`);
      }
    }

    // Step 9: Send completion message with video path
    let completionMessage = `✅ Video generated successfully!\n\n📁 Video saved at:\n\`${videoResult.videoPath}\``;

    if (MINIO_ENABLED && videoResult.minioUpload?.success) {
      completionMessage += `\n\n☁️ Uploaded to MinIO:\n\`${videoResult.minioUpload.url}\``;
      completionMessage += `\n📦 Bucket: ${videoResult.minioUpload.bucket}`;
      completionMessage += `\n🔑 Object key: ${videoResult.minioUpload.objectKey}`;
    }

    await progress.complete(completionMessage);

    logger.success("Bot", "Workflow completed successfully!");
  } catch (error) {
    logger.error("Bot", "Error processing audio", error);
    await progress.error(error instanceof Error ? error : new Error(String(error)));
  }
}



/**
 * Process audio file from URL through the complete workflow
 */
async function processAudioFromUrl(
  ctx: Context,
  url: string
): Promise<void> {
  // Initialize progress tracker
  const progress = new ProgressTracker(ctx);
  await progress.start("📎 URL received, starting processing...");

  try {
    // Step 1: Download audio file from URL
    await progress.update({
      step: "Downloading Audio",
      message: "Downloading audio file from URL...",
    });
    const audioFilePath = await downloadAudioFromUrl(url, TMP_AUDIO_DIR);
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
    const { segments, formattedTranscript } = processTranscript(transcript.words, transcript.audio_duration);
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

    // Step 6: Generate captions (if enabled)
    let assFilePath: string | undefined;
    if (CAPTIONS_ENABLED) {
      await progress.update({
        step: "Generating Captions",
        message: "Creating word-by-word highlighted captions...",
      });
      const captionResult = await generateCaptions(segments, transcript.words);
      assFilePath = captionResult.assFilePath;
      logger.step("Bot", `Captions created: ${captionResult.groups.length} groups`);
    }

    // Step 7: Generate video with FFmpeg
    await progress.update({
      step: "Generating Video",
      message: "Creating video with FFmpeg...\nThis may take a few minutes for long videos.",
    });
    validateVideoInputs(downloadedImages, audioFilePath);
    const videoResult = await generateVideo(downloadedImages, audioFilePath, assFilePath);
    logger.step("Bot", "Video created", videoResult.videoPath);

    // Step 8: Upload to MinIO (if enabled)
    if (MINIO_ENABLED) {
      await progress.update({
        step: "Uploading to MinIO",
        message: "Uploading video to MinIO object storage...",
      });
      const minioResult = await uploadVideoToMinIO(videoResult.videoPath);

      if (minioResult.success) {
        logger.success("Bot", `Video uploaded to MinIO: ${minioResult.url}`);
        videoResult.minioUpload = minioResult;
      } else {
        logger.warn("Bot", `MinIO upload failed: ${minioResult.error}`);
      }
    }

    // Step 9: Send completion message with video path
    let completionMessage = `✅ Video generated successfully!\n\n📁 Video saved at:\n\`${videoResult.videoPath}\``;

    if (MINIO_ENABLED && videoResult.minioUpload?.success) {
      completionMessage += `\n\n☁️ Uploaded to MinIO:\n\`${videoResult.minioUpload.url}\``;
      completionMessage += `\n📦 Bucket: ${videoResult.minioUpload.bucket}`;
      completionMessage += `\n🔑 Object key: ${videoResult.minioUpload.objectKey}`;
    }

    await progress.complete(completionMessage);

    logger.success("Bot", "Workflow completed successfully!");
  } catch (error) {
    logger.error("Bot", "Error processing audio from URL", error);
    await progress.error(error instanceof Error ? error : new Error(String(error)));
  }
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

