import * as logger from "../../utils/logger.ts";
import type { Context } from "../../utils/telegram/index.ts";
import { sendMessage } from "../../utils/telegram/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import type { Job, JobProcessor, QueueStatus } from "./types.ts";
import { formatQueueStatus as formatStatus, formatJobInfo, formatDuration } from "./formatter.ts";

class JobQueueService {
    private queue: Job[] = [];
    private isProcessing = false;
    private processor: JobProcessor | null = null;
    private contextMap: Map<string, Context> = new Map();

    private generateJobId(): string {
        return `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    setProcessor(processor: JobProcessor): void {
        this.processor = processor;
    }

    hasActiveJob(): boolean {
        return this.isProcessing;
    }

    /** Wait for current job before shutdown. Returns when job completes or timeout. */
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

        this.processNext();

        return job;
    }

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

        this.processNext();

        return job;
    }

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

    getJobsForChat(chatId: number | string): Job[] {
        return this.queue.filter(j => j.chatId === chatId);
    }

    getQueuePosition(jobId: string): number {
        const pendingJobs = this.queue.filter(j => j.status === "pending");
        const index = pendingJobs.findIndex(j => j.id === jobId);
        return index === -1 ? -1 : index + 1;
    }

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
            await this.processor(nextJob, ctx);

            nextJob.status = "completed";
            nextJob.completedAt = Date.now();
            logger.success("Queue", `Job ${nextJob.id} completed`);

        } catch (error) {
            nextJob.status = "failed";
            nextJob.completedAt = Date.now();
            nextJob.error = error instanceof Error ? error.message : String(error);
            logger.error("Queue", `Job ${nextJob.id} failed: ${nextJob.error}`);
        }

        this.contextMap.delete(nextJob.id);
        this.isProcessing = false;

        const pendingCount = this.queue.filter(j => j.status === "pending").length;
        if (pendingCount > 0) {
            logger.log("Queue", `${pendingCount} job(s) remaining in queue`);
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

    clearHistory(): number {
        const beforeCount = this.queue.length;
        this.queue = this.queue.filter(j => j.status === "pending" || j.status === "processing");
        const cleared = beforeCount - this.queue.length;
        logger.log("Queue", `Cleared ${cleared} completed/failed jobs from history`);
        return cleared;
    }

    formatQueueStatus(chatId?: number | string): string {
        return formatStatus(this.getQueueStatus(), chatId);
    }

    formatJobInfo(job: Job): string {
        return formatJobInfo(job);
    }

    formatDuration(seconds: number): string {
        return formatDuration(seconds);
    }
}

// Export singleton instance
export const jobQueue = new JobQueueService();
