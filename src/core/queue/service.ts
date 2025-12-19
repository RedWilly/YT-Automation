/**
 * Job Queue Service
 * Manages the queue of video generation jobs
 * Processes audio files in order and notifies on completion
 */

import * as logger from "../../utils/logger.ts";
import type { Context } from "../../utils/telegram/index.ts";
import { sendMessage } from "../../utils/telegram/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import type { Job, JobProcessor, QueueStatus } from "./types.ts";
import { formatQueueStatus as formatStatus, formatJobInfo, formatDuration } from "./formatter.ts";

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
     * Check if a job is currently being processed
     * @returns True if a job is in progress
     */
    hasActiveJob(): boolean {
        return this.isProcessing;
    }

    /**
     * Wait for the current job to finish (if any)
     * Used for graceful shutdown
     * @param maxWaitMs - Maximum time to wait in milliseconds (default: 5 minutes)
     * @returns Promise that resolves when current job is done or timeout
     */
    async waitForCurrentJob(maxWaitMs: number = 300000): Promise<void> {
        if (!this.isProcessing) {
            return;
        }

        logger.log("Queue", "Waiting for current job to finish before shutdown...");
        const startTime = Date.now();
        const pollInterval = 1000; // Check every second

        while (this.isProcessing && (Date.now() - startTime) < maxWaitMs) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        if (this.isProcessing) {
            logger.warn("Queue", "Timeout waiting for job to finish, proceeding with shutdown");
        } else {
            logger.success("Queue", "Current job finished, proceeding with shutdown");
        }
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
    getQueueStatus(): QueueStatus {
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
     * Format queue status for display
     * @param chatId - Optional: filter to show only jobs for this chat
     * @returns Formatted status string
     */
    formatQueueStatus(chatId?: number | string): string {
        return formatStatus(this.getQueueStatus(), chatId);
    }

    /**
     * Format job information for display (delegated to formatter)
     */
    formatJobInfo(job: Job): string {
        return formatJobInfo(job);
    }

    /**
     * Format duration (delegated to formatter)
     */
    formatDuration(seconds: number): string {
        return formatDuration(seconds);
    }
}

// Export singleton instance
export const jobQueue = new JobQueueService();
