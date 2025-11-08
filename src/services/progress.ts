/**
 * Progress tracking service
 * Manages workflow progress and sends updates via Telegram
 */

import { sendMessage, editMessage, type Context } from "../utils/telegram.ts";
import * as logger from "../logger.ts";
import type { ProgressUpdate } from "../types.ts";

/**
 * Progress tracker class to manage workflow progress
 */
export class ProgressTracker {
  private chatId: number | string;
  private messageId: number | null = null;
  private startTime: number = Date.now();

  constructor(ctx: Context) {
    if (!ctx.chat) {
      throw new Error("Context does not have a chat");
    }
    this.chatId = ctx.chat.id;
  }

  /**
   * Send initial progress message
   * @param message - Initial message text
   */
  async start(message: string): Promise<void> {
    try {
      const sentMessage = await sendMessage(this.chatId, message);
      this.messageId = sentMessage.message_id;
      this.startTime = Date.now();

      logger.debug("Progress", `Started tracking: ${message}`);
    } catch (error) {
      logger.error("Progress", `Failed to send initial message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update progress message
   * @param update - Progress update information
   */
  async update(update: ProgressUpdate): Promise<void> {
    try {
      const message = this.formatMessage(update);

      if (this.messageId) {
        await editMessage(this.chatId, this.messageId, message, { parse_mode: "Markdown" });
      } else {
        // If no message ID, send a new message
        const sentMessage = await sendMessage(this.chatId, message, { parse_mode: "Markdown" });
        this.messageId = sentMessage.message_id;
      }

      logger.debug("Progress", `Updated: ${update.step}`);
    } catch (error) {
      // Ignore "message is not modified" errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes("message is not modified")) {
        logger.warn("Progress", `Failed to update message: ${errorMsg}`);
      }
    }
  }

  /**
   * Send completion message
   * @param message - Completion message
   * @param youtubeUrl - Optional YouTube URL
   */
  async complete(message: string, youtubeUrl?: string): Promise<void> {
    try {
      const elapsedTime = this.getElapsedTime();
      let finalMessage = `✅ *${message}*\n\n`;

      if (youtubeUrl) {
        finalMessage += `🎬 *YouTube URL:*\n${youtubeUrl}\n\n`;
      }

      finalMessage += `⏱️ *Total time:* ${elapsedTime}`;

      if (this.messageId) {
        await editMessage(this.chatId, this.messageId, finalMessage, { parse_mode: "Markdown" });
      } else {
        await sendMessage(this.chatId, finalMessage, { parse_mode: "Markdown" });
      }

      logger.success("Progress", `Completed: ${message}`);
    } catch (error) {
      logger.error("Progress", `Failed to send completion message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send error message
   * @param error - Error message or Error object
   */
  async error(error: string | Error): Promise<void> {
    try {
      const errorMsg = error instanceof Error ? error.message : error;
      const elapsedTime = this.getElapsedTime();
      const message = `❌ *Error occurred*\n\n${errorMsg}\n\n⏱️ *Time elapsed:* ${elapsedTime}`;

      if (this.messageId) {
        await editMessage(this.chatId, this.messageId, message, { parse_mode: "Markdown" });
      } else {
        await sendMessage(this.chatId, message, { parse_mode: "Markdown" });
      }

      logger.error("Progress", `Error reported: ${errorMsg}`);
    } catch (err) {
      logger.error("Progress", `Failed to send error message: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Format progress update message
   * @param update - Progress update
   * @returns Formatted message
   */
  private formatMessage(update: ProgressUpdate): string {
    let message = `⏳ *${update.step}*\n\n`;
    message += `${update.message}\n\n`;

    if (update.percentage !== undefined) {
      const progressBar = this.createProgressBar(update.percentage);
      message += `${progressBar} ${update.percentage}%\n\n`;
    }

    if (update.current !== undefined && update.total !== undefined) {
      message += `📊 Progress: ${update.current}/${update.total}\n\n`;
    }

    const elapsedTime = this.getElapsedTime();
    message += `⏱️ Time elapsed: ${elapsedTime}`;

    return message;
  }

  /**
   * Create a visual progress bar
   * @param percentage - Progress percentage (0-100)
   * @returns Progress bar string
   */
  private createProgressBar(percentage: number): string {
    const totalBars = 10;
    const filledBars = Math.round((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;

    return "▓".repeat(filledBars) + "░".repeat(emptyBars);
  }

  /**
   * Get elapsed time since start
   * @returns Formatted elapsed time string
   */
  private getElapsedTime(): string {
    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }
}

