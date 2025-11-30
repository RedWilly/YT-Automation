/**
 * Job Queue Service for managing multiple video generation jobs
 * Processes audio files in order and notifies on completion
 * Supports style configuration per job
 */

import * as logger from "../logger.ts";
import type { Context } from "../utils/telegram.ts";
import { sendMessage } from "../utils/telegram.ts";
import type { ResolvedStyle } from "../styles/types.ts";

/**
 * Job status enumeration
 */
export type JobStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Job type enumeration
 */
export type JobType = "file" | "url";

/**
 * Represents a single job in the queue
 */
export interface Job {
  id: string;
  chatId: number | string;
  type: JobType;
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  // For file type jobs
  fileId?: string;
  filename?: string;
  // For URL type jobs
  url?: string;
  // Style configuration for this job
  style?: ResolvedStyle;
  // Result info
  videoPath?: string;
  error?: string;
}

/**
 * Callback function type for processing jobs
 */
export type JobProcessor = (job: Job, ctx: Context) => Promise<void>;

/**
 * Job Queue class - manages the queue of video generation jobs
 */
class JobQueueService {
  private queue: Job[] = [];
  private isProcessing = false;
  private processor: JobProcessor | null = null;
  private contextMap: Map<string, Context> = new Map();

  /**
   * Generate a unique job ID
   * @returns Unique job identifier
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Set the job processor function
   * @param processor - Function to process each job
   */
  setProcessor(processor: JobProcessor): void {
    this.processor = processor;
  }

  /**
   * Add a file-based job to the queue
   * @param ctx - Telegram context
   * @param fileId - Telegram file ID
   * @param filename - Original filename
   * @param style - Optional resolved style configuration
   * @returns Created job
   */
  addFileJob(ctx: Context, fileId: string, filename: string, style?: ResolvedStyle): Job {
    if (!ctx.chat) {
      throw new Error("Context does not have a chat");
    }

    const job: Job = {
      id: this.generateJobId(),
      chatId: ctx.chat.id,
      type: "file",
      status: "pending",
      createdAt: Date.now(),
      fileId,
      filename,
      style,
    };

    this.queue.push(job);
    this.contextMap.set(job.id, ctx);
    const styleInfo = style ? ` (style: ${style.name})` : "";
    logger.log("Queue", `Added file job ${job.id}: ${filename}${styleInfo}`);

    // Start processing if not already running
    this.processNext();

    return job;
  }

  /**
   * Add a URL-based job to the queue
   * @param ctx - Telegram context
   * @param url - Audio file URL
   * @param style - Optional resolved style configuration
   * @returns Created job
   */
  addUrlJob(ctx: Context, url: string, style?: ResolvedStyle): Job {
    if (!ctx.chat) {
      throw new Error("Context does not have a chat");
    }

    const job: Job = {
      id: this.generateJobId(),
      chatId: ctx.chat.id,
      type: "url",
      status: "pending",
      createdAt: Date.now(),
      url,
      style,
    };

    this.queue.push(job);
    this.contextMap.set(job.id, ctx);
    const styleInfo = style ? ` (style: ${style.name})` : "";
    logger.log("Queue", `Added URL job ${job.id}${styleInfo}`);

    // Start processing if not already running
    this.processNext();

    return job;
  }

  /**
   * Get current queue status
   * @returns Queue status information
   */
  getQueueStatus(): { pending: Job[]; processing: Job | null; completed: Job[]; total: number } {
    const pending = this.queue.filter(j => j.status === "pending");
    const processing = this.queue.find(j => j.status === "processing") || null;
    const completed = this.queue.filter(j => j.status === "completed" || j.status === "failed");

    return {
      pending,
      processing,
      completed,
      total: this.queue.length,
    };
  }

  /**
   * Get jobs for a specific chat
   * @param chatId - Chat ID to filter by
   * @returns Jobs for the specified chat
   */
  getJobsForChat(chatId: number | string): Job[] {
    return this.queue.filter(j => j.chatId === chatId);
  }

  /**
   * Get position in queue for a specific job
   * @param jobId - Job ID to check
   * @returns Position (1-based) or -1 if not found/not pending
   */
  getQueuePosition(jobId: string): number {
    const pendingJobs = this.queue.filter(j => j.status === "pending");
    const index = pendingJobs.findIndex(j => j.id === jobId);
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Process the next job in the queue
   */
  private async processNext(): Promise<void> {
    // Don't start if already processing
    if (this.isProcessing) {
      return;
    }

    // Find next pending job
    const nextJob = this.queue.find(j => j.status === "pending");
    if (!nextJob) {
      logger.debug("Queue", "No pending jobs in queue");
      return;
    }

    // Get the context for this job
    const ctx = this.contextMap.get(nextJob.id);
    if (!ctx) {
      logger.error("Queue", `No context found for job ${nextJob.id}`);
      nextJob.status = "failed";
      nextJob.error = "Context lost";
      this.processNext();
      return;
    }

    if (!this.processor) {
      logger.error("Queue", "No job processor set");
      return;
    }

    this.isProcessing = true;
    nextJob.status = "processing";
    nextJob.startedAt = Date.now();

    logger.step("Queue", `Processing job ${nextJob.id}`);

    try {
      // Process the job
      await this.processor(nextJob, ctx);

      // Mark as completed
      nextJob.status = "completed";
      nextJob.completedAt = Date.now();
      logger.success("Queue", `Job ${nextJob.id} completed`);

    } catch (error) {
      // Mark as failed
      nextJob.status = "failed";
      nextJob.completedAt = Date.now();
      nextJob.error = error instanceof Error ? error.message : String(error);
      logger.error("Queue", `Job ${nextJob.id} failed: ${nextJob.error}`);
    }

    // Clean up context
    this.contextMap.delete(nextJob.id);
    this.isProcessing = false;

    // Check for more pending jobs and notify user
    const pendingCount = this.queue.filter(j => j.status === "pending").length;
    if (pendingCount > 0) {
      logger.log("Queue", `${pendingCount} job(s) remaining in queue`);

      // Notify next user that their job is starting
      const nextPendingJob = this.queue.find(j => j.status === "pending");
      if (nextPendingJob) {
        const nextCtx = this.contextMap.get(nextPendingJob.id);
        if (nextCtx && nextCtx.chat) {
          await sendMessage(
            nextCtx.chat.id,
            `🚀 Your job is now starting! (Queue position: 1)`
          ).catch(() => { /* ignore notification errors */ });
        }
      }

      // Process next job
      this.processNext();
    } else {
      logger.log("Queue", "Queue is now empty");
    }
  }

  /**
   * Clear completed/failed jobs from history
   */
  clearHistory(): number {
    const beforeCount = this.queue.length;
    this.queue = this.queue.filter(j => j.status === "pending" || j.status === "processing");
    const cleared = beforeCount - this.queue.length;
    logger.log("Queue", `Cleared ${cleared} completed/failed jobs from history`);
    return cleared;
  }

  /**
   * Escape special Markdown characters for Telegram
   * @param text - Text to escape
   * @returns Escaped text safe for Markdown
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
  }

  /**
   * Format queue status for display
   * @param chatId - Optional: filter to show only jobs for this chat
   * @returns Formatted status string
   */
  formatQueueStatus(chatId?: number | string): string {
    const status = this.getQueueStatus();

    let message = "📋 *Job Queue Status*\n\n";

    // Current processing
    if (status.processing) {
      const duration = status.processing.startedAt
        ? Math.floor((Date.now() - status.processing.startedAt) / 1000)
        : 0;
      message += `🔄 *Currently Processing:*\n`;
      message += `   • ${this.formatJobInfo(status.processing)}\n`;
      message += `   • Running for: ${this.formatDuration(duration)}\n\n`;
    }

    // Pending jobs
    if (status.pending.length > 0) {
      message += `⏳ *Pending Jobs \\(${status.pending.length}\\):*\n`;
      const jobsToShow = chatId
        ? status.pending.filter(j => j.chatId === chatId)
        : status.pending.slice(0, 5); // Show max 5

      for (let i = 0; i < jobsToShow.length; i++) {
        const job = jobsToShow[i];
        if (!job) continue;
        message += `   ${i + 1}\\. ${this.formatJobInfo(job)}\n`;
      }

      if (!chatId && status.pending.length > 5) {
        message += `   \\.\\.\\. and ${status.pending.length - 5} more\n`;
      }
      message += "\n";
    } else {
      message += "✅ *No pending jobs*\n\n";
    }

    // Summary
    message += `📊 *Total in queue:* ${status.pending.length + (status.processing ? 1 : 0)}`;

    return message;
  }

  /**
   * Format job information for display
   * @param job - Job to format
   * @returns Formatted job string
   */
  private formatJobInfo(job: Job): string {
    const styleTag = job.style ? ` \\[${this.escapeMarkdown(job.style.name)}\\]` : "";

    if (job.type === "file") {
      const filename = this.escapeMarkdown(job.filename || "Unknown");
      return `File: ${filename}${styleTag}`;
    }
    // Truncate URL for display
    const urlRaw = job.url && job.url.length > 40
      ? job.url.substring(0, 37) + "..."
      : job.url || "Unknown URL";
    return `URL: ${this.escapeMarkdown(urlRaw)}${styleTag}`;
  }

  /**
   * Format duration in human-readable format
   * @param seconds - Duration in seconds
   * @returns Formatted duration string
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}

// Export singleton instance
export const jobQueue = new JobQueueService();

