import {
    downloadTelegramFile,
    downloadAudioFromUrl,
    type Context,
} from "../../utils/telegram/index.ts";
import { DEFAULT_PATHS } from "../../config/defaults.ts";
import { MINIO } from "../../config/index.ts";
import type { WorkflowResult } from "../../types/index.ts";
import type { ResolvedStyle } from "../../styles/types.ts";
import { getDefaultStyle, resolveStyle } from "../../styles/index.ts";
import { ProgressTracker } from "../progress.ts";
import { runCoreWorkflow } from "./orchestrator.ts";
import * as logger from "../../utils/logger.ts";

const TMP_AUDIO_DIR = DEFAULT_PATHS.audio;

export class WorkflowService {
    static async processAudioFile(
        ctx: Context,
        fileId: string,
        filename: string,
        style?: ResolvedStyle
    ): Promise<WorkflowResult> {
        const resolvedStyle = style ?? resolveStyle(getDefaultStyle());

        const progress = new ProgressTracker(ctx);
        await progress.start(`🎙️ Audio received, starting processing...\n🎨 Style: ${resolvedStyle.name}`);

        try {
            await progress.update({
                step: "Downloading Audio",
                message: "Downloading audio file from Telegram...",
            });
            const audioFilePath = await downloadTelegramFile(fileId, filename, TMP_AUDIO_DIR);
            logger.step("Workflow", "Audio downloaded", audioFilePath);

            const result = await runCoreWorkflow(audioFilePath, progress, resolvedStyle);

            await progress.complete(this.buildCompletionMessage(result, resolvedStyle));
            logger.success("Workflow", "Workflow completed successfully!");

            return result;
        } catch (error) {
            logger.error("Workflow", "Error processing audio", error);
            await progress.error(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    static async processAudioFromUrl(
        ctx: Context,
        url: string,
        style?: ResolvedStyle
    ): Promise<WorkflowResult> {
        const resolvedStyle = style ?? resolveStyle(getDefaultStyle());

        const progress = new ProgressTracker(ctx);
        await progress.start(`📎 URL received, starting processing...\n🎨 Style: ${resolvedStyle.name}`);

        try {
            await progress.update({
                step: "Downloading Audio",
                message: "Downloading audio file from URL...",
            });
            const audioFilePath = await downloadAudioFromUrl(url, TMP_AUDIO_DIR);
            logger.step("Workflow", "Audio downloaded", audioFilePath);

            const result = await runCoreWorkflow(audioFilePath, progress, resolvedStyle);

            await progress.complete(this.buildCompletionMessage(result, resolvedStyle));
            logger.success("Workflow", "Workflow completed successfully!");

            return result;
        } catch (error) {
            logger.error("Workflow", "Error processing audio from URL", error);
            await progress.error(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    private static buildCompletionMessage(result: WorkflowResult, style: ResolvedStyle): string {
        let completionMessage = `✅ Video generated successfully!\n\n🎨 Style: ${style.name}`;
        completionMessage += `\n📁 Video saved at:\n\`${result.videoPath}\``;

        if (MINIO.enabled && result.minioUpload?.success) {
            completionMessage += `\n\n☁️ Uploaded to MinIO:\n\`${result.minioUpload.url}\``;
            completionMessage += `\n📦 Bucket: ${result.minioUpload.bucket}`;
            completionMessage += `\n🔑 Object key: ${result.minioUpload.objectKey}`;
        }

        return completionMessage;
    }
}

export { runCoreWorkflow } from "./orchestrator.ts";
export * from "./stages/types.ts";
