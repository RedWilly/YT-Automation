/**
 * Telegram bot entry point
 * Assembles commands and handlers into a configured bot instance
 */

import { getTelegramBot, type Context } from "../utils/telegram.ts";
import { WorkflowService } from "../core/workflow.ts";
import { jobQueue, type Job } from "../core/queue.ts";
import * as logger from "../utils/logger.ts";

// Import commands
import {
    handleStartCommand,
    handleHelpCommand,
    handleStylesCommand,
    handleUploadCommand,
    handleUrlCommand,
    handleUrlInput,
    handleCleanupCommand,
    handleQueueCommand,
} from "./commands/index.ts";

// Import handlers
import {
    handleVoiceMessage,
    handleAudioMessage,
    handleDocumentMessage,
} from "./handlers/index.ts";

// Import utilities
import { waitingForUrl } from "./utils.ts";

/**
 * Create and configure the Telegram bot
 * @returns Configured Telegraf bot instance
 */
export function createBot() {
    const bot = getTelegramBot();

    // Error handling
    bot.catch((err: unknown, ctx: Context) => {
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
 * Start the bot with graceful error handling
 * Handles 409 Conflict errors when another bot instance starts
 */
export async function startBot(): Promise<void> {
    logger.log("Bot", "Initializing bot...");

    // Set up the job queue processor
    jobQueue.setProcessor(processJob);

    const bot = createBot();

    logger.log("Bot", "Starting Telegram bot...");

    // Graceful shutdown handler
    const gracefulShutdown = async (reason: string) => {
        logger.log("Bot", `Received ${reason}, initiating graceful shutdown...`);

        // Check if there's an active job
        if (jobQueue.hasActiveJob()) {
            logger.log("Bot", "Active job detected, waiting for completion...");
            await jobQueue.waitForCurrentJob();
        }

        bot.stop(reason);
        logger.log("Bot", "Bot stopped gracefully");
    };

    // Enable graceful stop on signals
    process.once("SIGINT", () => gracefulShutdown("SIGINT"));
    process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

    try {
        await bot.launch();
        logger.success("Bot", "Bot is running! Send /start to begin.");
        logger.log("Bot", "Listening for voice and audio messages...");
    } catch (error) {
        // Handle 409 Conflict error specifically
        if (error instanceof Error && error.message.includes("409")) {
            logger.error("Bot", "Another bot instance is already running!");
            logger.log("Bot", "If you want to run locally, stop the other instance first.");

            // Check if there's work in progress (though unlikely at startup)
            if (jobQueue.hasActiveJob()) {
                logger.log("Bot", "Waiting for any active jobs to complete...");
                await jobQueue.waitForCurrentJob();
            }

            // Exit with code 1 but don't throw - prevents ugly stack trace
            process.exit(1);
        }

        // Re-throw other errors
        throw error;
    }

    // Set up error handler for runtime 409 errors (when another instance starts later)
    bot.catch(async (err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (errorMessage.includes("409") || errorMessage.includes("Conflict")) {
            logger.warn("Bot", "Bot connection terminated by another instance");

            // Wait for any active job to complete
            if (jobQueue.hasActiveJob()) {
                logger.log("Bot", "Waiting for current job to finish before exiting...");
                await jobQueue.waitForCurrentJob();
            }

            logger.log("Bot", "Shutting down gracefully due to conflict");
            process.exit(0); // Exit cleanly
        } else {
            // Log other errors normally
            logger.error("Bot", "Unhandled bot error", err);
        }
    });
}
