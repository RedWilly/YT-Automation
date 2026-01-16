import type { Job } from "./types.ts";

export function escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

export function formatJobInfo(job: Job): string {
    const styleTag = job.style ? ` \\[${escapeMarkdown(job.style.name)}\\]` : "";

    if (job.type === "file") {
        const filename = escapeMarkdown(job.filename || "Unknown");
        return `File: ${filename}${styleTag}`;
    }
    // Truncate URL for display
    const urlRaw = job.url && job.url.length > 40
        ? job.url.substring(0, 37) + "..."
        : job.url || "Unknown URL";
    return `URL: ${escapeMarkdown(urlRaw)}${styleTag}`;
}

export function formatQueueStatus(
    status: { pending: Job[]; processing: Job | null; completed: Job[]; total: number },
    chatId?: number | string
): string {
    let message = "📋 *Job Queue Status*\n\n";

    // Current processing
    if (status.processing) {
        const duration = status.processing.startedAt
            ? Math.floor((Date.now() - status.processing.startedAt) / 1000)
            : 0;
        message += `🔄 *Currently Processing:*\n`;
        message += `   • ${formatJobInfo(status.processing)}\n`;
        message += `   • Running for: ${formatDuration(duration)}\n\n`;
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
            message += `   ${i + 1}\\. ${formatJobInfo(job)}\n`;
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
