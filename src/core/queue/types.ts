import type { Context } from "../../utils/telegram/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type JobType = "file" | "url";

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

export type JobProcessor = (job: Job, ctx: Context) => Promise<void>;

export interface QueueStatus {
    pending: Job[];
    processing: Job | null;
    completed: Job[];
    total: number;
}
