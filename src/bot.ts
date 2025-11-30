/**
 * Telegram bot for YouTube automation workflow
 * Supports style selection via #hashtags and --options
 */

import {
  getTelegramBot,
  type Context,
} from "./utils/telegram.ts";
import { USE_AI_IMAGE } from "./constants.ts";
import { cleanupTempFiles } from "./services/cleanup.ts";
import { WorkflowService } from "./services/workflow.ts";
import { TMP_AUDIO_DIR } from "./constants.ts";
import * as logger from "./logger.ts";
import { jobQueue, type Job } from "./services/queue.ts";
import { parseStyleFromMessage, getStyleIds, getDefaultStyle, getStyle, resolveStyle } from "./styles/index.ts";
import type { ResolvedStyle } from "./styles/types.ts";

/**
 * State management for tracking users waiting to provide URLs
 * Stores chatId -> { style?: ResolvedStyle } for pending URL inputs
 */
const waitingForUrl = new Map<number, { style?: ResolvedStyle }>();

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
  bot.command("queue", handleQueueCommand);
  bot.command("help", handleHelpCommand);
  bot.command("styles", handleStylesCommand);

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
        const pendingState = waitingForUrl.get(chatId);
        waitingForUrl.delete(chatId);
        await handleUrlInput(ctx, text, pendingState?.style);
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
    "   • Options: --pan, --no-pan, --karaoke, --no-karaoke\n\n" +
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

/**
 * Handle /upload command
 */
async function handleUploadCommand(ctx: Context): Promise<void> {
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
 * Handle /queue command
 * Shows the current job queue status
 */
async function handleQueueCommand(ctx: Context): Promise<void> {
  logger.log("Bot", "Received /queue command");

  if (!ctx.chat) {
    logger.error("Bot", "No chat context available");
    return;
  }

  const chatId = ctx.chat.id;
  const queueStatus = jobQueue.formatQueueStatus(chatId);

  await ctx.reply(queueStatus, { parse_mode: "MarkdownV2" });
}

/**
 * Handle /help command
 * Shows detailed help about styles and options
 */
async function handleHelpCommand(ctx: Context): Promise<void> {
  logger.log("Bot", "Received /help command");

  await ctx.reply(
    "📖 *Detailed Help*\n\n" +
    "*Style Selection:*\n" +
    "Add a hashtag to your message caption to select a style:\n" +
    "• `#history` \\- Classical oil painting style \\(default\\)\n" +
    "• `#ww2` \\- Black\\-and\\-white archival photography\n\n" +
    "*Options \\(override style defaults\\):*\n" +
    "• `--pan` / `--no-pan` \\- Enable/disable pan effect\n" +
    "• `--karaoke` / `--no-karaoke` \\- Enable/disable word highlighting\n" +
    "• `--highlight=COLOR` \\- Set highlight color \\(purple, yellow, cyan, green, red, white\\)\n\n" +
    "*Examples:*\n" +
    "• Send audio with caption: `#ww2`\n" +
    "• Send audio with caption: `#history --no-pan`\n" +
    "• Send audio with caption: `#ww2 --karaoke --highlight=yellow`\n\n" +
    "*Commands:*\n" +
    "• /start \\- Welcome message\n" +
    "• /upload \\- Upload audio file\n" +
    "• /url \\- Process audio from URL\n" +
    "• /queue \\- View job queue\n" +
    "• /styles \\- View available styles\n" +
    "• /cleanup \\- Remove temp files",
    { parse_mode: "MarkdownV2" }
  );
}

/**
 * Handle /styles command
 * Shows available video styles with descriptions
 */
async function handleStylesCommand(ctx: Context): Promise<void> {
  logger.log("Bot", "Received /styles command");

  const defaultStyle = getDefaultStyle();

  await ctx.reply(
    "🎨 *Available Video Styles*\n\n" +
    "*#history* \\(default\\)\n" +
    "Classical oil painting aesthetic\n" +
    "• Sentence\\-based segmentation\n" +
    "• Pan effect enabled\n" +
    "• Karaoke captions with purple highlight\n\n" +
    "*#ww2*\n" +
    "Black\\-and\\-white archival photography\n" +
    "• Word\\-count segmentation \\(100 words\\)\n" +
    "• Pan effect disabled\n" +
    "• Simple white captions \\(no karaoke\\)\n\n" +
    `📌 Default style: *${defaultStyle.name}*`,
    { parse_mode: "MarkdownV2" }
  );
}

/**
 * Handle /url command
 * Prompts user to provide a presigned URL for large audio files
 * Supports style parsing from command text
 */
async function handleUrlCommand(ctx: Context): Promise<void> {
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

/**
 * Handle URL input from user
 * Adds the URL job to the queue for processing
 * @param ctx - Telegram context
 * @param url - Audio file URL
 * @param style - Optional resolved style configuration
 */
async function handleUrlInput(ctx: Context, url: string, style?: ResolvedStyle): Promise<void> {
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
 * Parse style from message caption
 * @param ctx - Telegram context
 * @returns Resolved style or undefined
 */
function parseStyleFromCaption(ctx: Context): ResolvedStyle | undefined {
  if (!ctx.message) return undefined;

  // Get caption from message (voice, audio, document all can have captions)
  const caption = "caption" in ctx.message ? ctx.message.caption : undefined;
  if (!caption) return undefined;

  const { styleId, options } = parseStyleFromMessage(caption);
  const baseStyle = getStyle(styleId) ?? getDefaultStyle();
  return resolveStyle(baseStyle, options);
}

/**
 * Handle voice messages
 * Adds the voice file to the queue for processing
 */
async function handleVoiceMessage(ctx: Context): Promise<void> {
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
  // If position is 1, it will start immediately and the workflow will notify
}

/**
 * Handle audio messages
 * Adds the audio file to the queue for processing
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
  // If position is 1, it will start immediately and the workflow will notify
}

/**
 * Handle document messages (audio files sent as documents)
 * Adds the audio document to the queue for processing
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
  // If position is 1, it will start immediately and the workflow will notify
}

/**
 * Job processor function for the queue
 * Processes file and URL jobs using WorkflowService
 * Passes style configuration from job to workflow
 */
async function processJob(job: Job, ctx: Context): Promise<void> {
  if (job.type === "file" && job.fileId && job.filename) {
    await WorkflowService.processAudioFile(ctx, job.fileId, job.filename, job.style);
  } else if (job.type === "url" && job.url) {
    await WorkflowService.processAudioFromUrl(ctx, job.url, job.style);
  } else {
    throw new Error(`Invalid job configuration: ${job.id}`);
  }
}

/**
 * Start the bot
 */
export async function startBot(): Promise<void> {
  logger.log("Bot", "Initializing bot...");

  // Set up the job queue processor
  jobQueue.setProcessor(processJob);

  const bot = createBot();

  logger.log("Bot", "Starting Telegram bot...");

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  await bot.launch();

  logger.success("Bot", "Bot is running! Send /start to begin.");
  logger.log("Bot", "Listening for voice and audio messages...");
}

