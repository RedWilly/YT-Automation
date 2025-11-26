/**
 * Workflow service for orchestrating the audio-to-video process
 */

import {
    downloadTelegramFile,
    downloadAudioFromUrl,
    type Context,
} from "../utils/telegram.ts";
import { TMP_AUDIO_DIR, MINIO_ENABLED } from "../constants.ts";
import type { WorkflowResult } from "../types.ts";
import { transcribeAudio } from "./assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./transcript.ts";
import { generateImageQueries, validateImageQueries } from "./llm.ts";
import {
    downloadImagesForQueries,
    validateDownloadedImages,
} from "./images.ts";
import { generateVideo, validateVideoInputs } from "./video.ts";
import { uploadVideoToMinIO } from "./minio.ts";
import { ProgressTracker } from "./progress.ts";
import * as logger from "../logger.ts";
import path from "node:path";

/**
 * Service to handle the complete audio-to-video workflow
 */
export class WorkflowService {
    /**
     * Process audio file from Telegram through the complete workflow
     */
    static async processAudioFile(
        ctx: Context,
        fileId: string,
        filename: string
    ): Promise<WorkflowResult> {
        // Initialize progress tracker
        const progress = new ProgressTracker(ctx);
        await progress.start("🎙️ Audio received, starting processing...");

        try {
            // Step 1: Download audio file from Telegram
            await progress.update({
                step: "Downloading Audio",
                message: "Downloading audio file from Telegram...",
            });
            const audioFilePath = await downloadTelegramFile(fileId, filename, TMP_AUDIO_DIR);
            logger.step("Workflow", "Audio downloaded", audioFilePath);

            // Run the core processing logic
            const result = await this.runCoreWorkflow(audioFilePath, progress);

            await progress.complete(this.buildCompletionMessage(result));
            logger.success("Workflow", "Workflow completed successfully!");

            return result;
        } catch (error) {
            logger.error("Workflow", "Error processing audio", error);
            await progress.error(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Process audio file from URL through the complete workflow
     */
    static async processAudioFromUrl(
        ctx: Context,
        url: string
    ): Promise<WorkflowResult> {
        // Initialize progress tracker
        const progress = new ProgressTracker(ctx);
        await progress.start("📎 URL received, starting processing...");

        try {
            // Step 1: Download audio file from URL
            await progress.update({
                step: "Downloading Audio",
                message: "Downloading audio file from URL...",
            });
            const audioFilePath = await downloadAudioFromUrl(url, TMP_AUDIO_DIR);
            logger.step("Workflow", "Audio downloaded", audioFilePath);

            // Run the core processing logic
            const result = await this.runCoreWorkflow(audioFilePath, progress);

            await progress.complete(this.buildCompletionMessage(result));
            logger.success("Workflow", "Workflow completed successfully!");

            return result;
        } catch (error) {
            logger.error("Workflow", "Error processing audio from URL", error);
            await progress.error(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Run the core workflow logic (transcription -> images -> video)
     * This is shared between Telegram file and URL workflows
     */
    private static async runCoreWorkflow(
        audioFilePath: string,
        progress: ProgressTracker
    ): Promise<WorkflowResult> {
        // Step 2: Transcribe audio with AssemblyAI
        await progress.update({
            step: "Transcription",
            message: "Transcribing audio with AssemblyAI...\nThis may take a few minutes.",
        });
        const transcript = await transcribeAudio(audioFilePath);
        logger.step("Workflow", "Transcription completed", `${transcript.text.substring(0, 100)}...`);

        // Validate transcript data
        validateTranscriptData(transcript.words);

        // Step 3: Process transcript into segments
        await progress.update({
            step: "Processing Transcript",
            message: "Segmenting transcript into scenes...",
        });
        const { segments, formattedTranscript } = processTranscript(transcript.words, transcript.audio_duration);
        logger.step("Workflow", `Created ${segments.length} segments`);

        // Step 4: Generate image search queries with LLM
        await progress.update({
            step: "Generating Image Queries",
            message: "Using AI to generate visual scene descriptions...",
        });
        const imageQueries = await generateImageQueries(formattedTranscript);
        validateImageQueries(imageQueries);
        logger.step("Workflow", `Generated ${imageQueries.length} image queries`);

        // Validate that we have exactly one query per segment
        if (imageQueries.length !== segments.length) {
            throw new Error(
                `Mismatch: Expected ${segments.length} queries (one per segment), but got ${imageQueries.length} queries from LLM`
            );
        }
        logger.success("Workflow", `Query count matches segment count (${segments.length})`);

        // Validate that timestamps match
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const query = imageQueries[i];
            if (!segment || !query) continue;

            if (query.start !== segment.start || query.end !== segment.end) {
                logger.warn(
                    "Workflow",
                    `Timestamp mismatch at segment ${i + 1}: ` +
                    `Expected [${segment.start}-${segment.end}ms], ` +
                    `Got [${query.start}-${query.end}ms]`
                );
            }
        }

        // Step 5: Search and download images
        await progress.update({
            step: "Downloading Images",
            message: `Searching and downloading ${imageQueries.length} images...`,
            current: 0,
            total: imageQueries.length,
        });
        const downloadedImages = await downloadImagesForQueries(imageQueries);
        validateDownloadedImages(downloadedImages);
        logger.step("Workflow", `Downloaded ${downloadedImages.length} images`);

        // Step 6: Generate video with FFmpeg
        await progress.update({
            step: "Generating Video",
            message: "Creating video with FFmpeg...\nThis may take a few minutes for long videos.",
        });
        validateVideoInputs(downloadedImages, audioFilePath);
        const outputFileName = path.parse(audioFilePath).name;
        const videoResult = await generateVideo(downloadedImages, audioFilePath, transcript.words, segments, outputFileName);
        logger.step("Workflow", "Video created", videoResult.videoPath);

        const result: WorkflowResult = {
            videoPath: videoResult.videoPath,
            duration: videoResult.duration,
        };

        // Step 8: Upload to MinIO (if enabled)
        if (MINIO_ENABLED) {
            await progress.update({
                step: "Uploading to MinIO",
                message: "Uploading video to MinIO object storage...",
            });
            const minioResult = await uploadVideoToMinIO(videoResult.videoPath);

            if (minioResult.success) {
                logger.success("Workflow", `Video uploaded to MinIO: ${minioResult.url}`);
                result.minioUpload = minioResult;
            } else {
                logger.warn("Workflow", `MinIO upload failed: ${minioResult.error}`);
            }
        }

        return result;
    }

    /**
     * Build the completion message for the user
     */
    private static buildCompletionMessage(result: WorkflowResult): string {
        let completionMessage = `✅ Video generated successfully!\n\n📁 Video saved at:\n\`${result.videoPath}\``;

        if (MINIO_ENABLED && result.minioUpload?.success) {
            completionMessage += `\n\n☁️ Uploaded to MinIO:\n\`${result.minioUpload.url}\``;
            completionMessage += `\n📦 Bucket: ${result.minioUpload.bucket}`;
            completionMessage += `\n🔑 Object key: ${result.minioUpload.objectKey}`;
        }

        return completionMessage;
    }
}
