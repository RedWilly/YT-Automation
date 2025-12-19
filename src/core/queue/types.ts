/**
 * Queue Types
 * Type definitions for the job queue system
 */

import type { Context } from "../../utils/telegram/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";

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
 * Queue status information
 */
export interface QueueStatus {
    pending: Job[];
    processing: Job | null;
    completed: Job[];
    total: number;
}
