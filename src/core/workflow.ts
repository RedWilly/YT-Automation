/**
 * Workflow service for orchestrating the audio-to-video process
 * Supports configurable video styles via style system
 * Uses SQLite cache to skip completed steps and avoid redundant API calls
 */

import {
    downloadTelegramFile,
    downloadAudioFromUrl,
    type Context,
} from "../utils/telegram.ts";
import { DEFAULT_PATHS } from "../config/defaults.ts";
import { MINIO } from "../config/environment.ts";
import type { WorkflowResult, AssemblyAIWord, TranscriptSegment, ImageSearchQuery, DownloadedImage } from "../types/index.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import { getDefaultStyle, resolveStyle } from "../styles/index.ts";
import { transcribeAudio } from "../services/transcription/index.ts";
import { processTranscript, validateTranscriptData } from "../services/transcription/index.ts";
import { generateImageQueries, validateImageQueries } from "../services/llm/index.ts";
import {
    downloadImagesForQueries,
    validateDownloadedImages,
} from "../services/image/index.ts";
import { generateVideo, validateVideoInputs } from "../services/video/index.ts";
import { uploadVideoToMinIO } from "../services/storage/index.ts";
import { ProgressTracker } from "./progress.ts";
import {
    hashAudioFile,
    updateAudioCache,
    updateStyleCache,
    getCachedTranscript,
    getCachedSegments,
    getCachedImageQueries,
    getCachedImages,
} from "../services/storage/index.ts";
import * as logger from "../utils/logger.ts";
import path from "node:path";

const TMP_AUDIO_DIR = DEFAULT_PATHS.audio;

/**
 * Service to handle the complete audio-to-video workflow
 */
export class WorkflowService {
    /**
     * Process audio file from Telegram through the complete workflow
     * @param ctx - Telegram context
     * @param fileId - Telegram file ID
     * @param filename - Original filename
     * @param style - Resolved style configuration (optional, defaults to history style)
     */
    static async processAudioFile(
        ctx: Context,
        fileId: string,
        filename: string,
        style?: ResolvedStyle
    ): Promise<WorkflowResult> {
        // Use default style if not provided
        const resolvedStyle = style ?? resolveStyle(getDefaultStyle());

        // Initialize progress tracker
        const progress = new ProgressTracker(ctx);
        await progress.start(`🎙️ Audio received, starting processing...\n🎨 Style: ${resolvedStyle.name}`);

        try {
            // Step 1: Download audio file from Telegram
            await progress.update({
                step: "Downloading Audio",
                message: "Downloading audio file from Telegram...",
            });
            const audioFilePath = await downloadTelegramFile(fileId, filename, TMP_AUDIO_DIR);
            logger.step("Workflow", "Audio downloaded", audioFilePath);

            // Run the core processing logic
            const result = await this.runCoreWorkflow(audioFilePath, progress, resolvedStyle);

            await progress.complete(this.buildCompletionMessage(result, resolvedStyle));
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
     * @param ctx - Telegram context
     * @param url - Audio file URL
     * @param style - Resolved style configuration (optional, defaults to history style)
     */
    static async processAudioFromUrl(
        ctx: Context,
        url: string,
        style?: ResolvedStyle
    ): Promise<WorkflowResult> {
        // Use default style if not provided
        const resolvedStyle = style ?? resolveStyle(getDefaultStyle());

        // Initialize progress tracker
        const progress = new ProgressTracker(ctx);
        await progress.start(`📎 URL received, starting processing...\n🎨 Style: ${resolvedStyle.name}`);

        try {
            // Step 1: Download audio file from URL
            await progress.update({
                step: "Downloading Audio",
                message: "Downloading audio file from URL...",
            });
            const audioFilePath = await downloadAudioFromUrl(url, TMP_AUDIO_DIR);
            logger.step("Workflow", "Audio downloaded", audioFilePath);

            // Run the core processing logic
            const result = await this.runCoreWorkflow(audioFilePath, progress, resolvedStyle);

            await progress.complete(this.buildCompletionMessage(result, resolvedStyle));
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
     * Uses SQLite cache to skip steps that have already been completed
     * 
     * @param audioFilePath - Path to the audio file
     * @param progress - Progress tracker for status updates
     * @param style - Resolved style configuration
     */
    private static async runCoreWorkflow(
        audioFilePath: string,
        progress: ProgressTracker,
        style: ResolvedStyle
    ): Promise<WorkflowResult> {
        logger.step("Workflow", `Using style: ${style.name} (${style.id})`);
        logger.debug("Workflow", `Segmentation: ${style.segmentationType}, Pan: ${style.panEffect}, Captions: ${style.captionsEnabled}`);

        // =============================================================
        // CACHE INITIALIZATION
        // =============================================================
        await progress.update({
            step: "Initializing",
            message: "Checking cache and preparing workflow...",
        });

        // Hash the audio file for cache lookup
        const audioHash = await hashAudioFile(audioFilePath);
        const filename = path.basename(audioFilePath);

        // Initialize cache entry with filename
        updateAudioCache(audioHash, {
            audio_filename: filename,
            audio_path: audioFilePath
        });

        // =============================================================
        // STEP 1-2: TRANSCRIPTION (Check cache first)
        // =============================================================
        let transcriptWords: AssemblyAIWord[];
        let audioDuration: number | null;

        const cachedTranscript = getCachedTranscript(audioHash);

        if (cachedTranscript) {
            logger.log("Workflow", "📦 Using cached transcript (skipping AssemblyAI API call)");
            transcriptWords = cachedTranscript.words;
            audioDuration = cachedTranscript.audioDuration;
        } else {
            await progress.update({
                step: "Transcription",
                message: "Transcribing audio with AssemblyAI...\\nThis may take a few minutes.",
            });

            const transcript = await transcribeAudio(audioFilePath);
            transcriptWords = transcript.words;
            audioDuration = transcript.audio_duration;

            // Save to cache (shared - same for all styles)
            updateAudioCache(audioHash, {
                transcript_id: transcript.id,
                transcript_words: JSON.stringify(transcript.words),
                audio_duration: transcript.audio_duration ?? undefined,
            });

            logger.step("Workflow", "Transcription completed and cached");
        }

        // Validate transcript data
        validateTranscriptData(transcriptWords);

        // =============================================================
        // STEP 3: SEGMENTATION (Check cache first, style-specific)
        // =============================================================
        let segments: TranscriptSegment[];
        let formattedTranscript: string;

        // Segments are shared across orientations but depend on multi-image mode
        const cachedSegments = getCachedSegments(audioHash, style.id, "horizontal", style.multiImageSegments);

        if (cachedSegments) {
            logger.log("Workflow", "📦 Using cached segments (same style)");
            segments = cachedSegments.segments;
            formattedTranscript = cachedSegments.formattedTranscript;
        } else {
            await progress.update({
                step: "Processing Transcript",
                message: `Segmenting transcript (${style.segmentationType} mode)...`,
            });

            const result = processTranscript(transcriptWords, audioDuration, style);
            segments = result.segments;
            formattedTranscript = result.formattedTranscript;

            // Save to style-specific cache (shared across orientations)
            updateStyleCache(audioHash, style.id, "horizontal", style.multiImageSegments, {
                segments: JSON.stringify(segments),
                formatted_transcript: formattedTranscript,
            });

            logger.step("Workflow", `Created ${segments.length} segments and cached`);
        }

        // =============================================================
        // STEP 4: LLM IMAGE QUERIES (Check cache first, style-specific)
        // =============================================================
        let imageQueries: ImageSearchQuery[];

        // Image queries depend on multi-image mode setting
        const cachedQueries = getCachedImageQueries(audioHash, style.id, "horizontal", style.multiImageSegments);

        if (cachedQueries) {
            logger.log("Workflow", "📦 Using cached image queries (skipping LLM API call)");
            imageQueries = cachedQueries;
        } else {
            await progress.update({
                step: "Generating Image Queries",
                message: "Using AI to generate visual scene descriptions...",
            });

            imageQueries = await generateImageQueries(formattedTranscript, style);
            validateImageQueries(imageQueries);

            // Save to style-specific cache (shared across orientations)
            updateStyleCache(audioHash, style.id, "horizontal", style.multiImageSegments, {
                image_queries: JSON.stringify(imageQueries),
            });

            logger.step("Workflow", `Generated ${imageQueries.length} image queries and cached`);
        }

        // Validate query count
        // When multiImageSegments is enabled, we expect more queries than segments
        if (style.multiImageSegments) {
            // In multi-image mode: queries should be >= segments (longer sentences get multiple images)
            if (imageQueries.length < segments.length) {
                throw new Error(
                    `Mismatch: Expected at least ${segments.length} queries, but got ${imageQueries.length} from LLM`
                );
            }
            logger.success("Workflow", `Multi-image mode: ${segments.length} segments → ${imageQueries.length} images`);
        } else {
            // Standard mode: exactly one query per segment
            if (imageQueries.length !== segments.length) {
                throw new Error(
                    `Mismatch: Expected ${segments.length} queries (one per segment), but got ${imageQueries.length} queries from LLM`
                );
            }
            logger.success("Workflow", `Query count matches segment count (${segments.length})`);
        }

        // Validate that timestamps are within valid range (only for standard mode)
        // In multi-image mode, LLM distributes timestamps within segment ranges
        if (!style.multiImageSegments) {
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
        }

        // =============================================================
        // STEP 5: DOWNLOAD/GENERATE IMAGES (Check cache first)
        // =============================================================
        let downloadedImages: DownloadedImage[];

        const cachedImages = getCachedImages(audioHash, style.id, style.orientation, style.multiImageSegments);

        if (cachedImages && cachedImages.length === imageQueries.length) {
            logger.log("Workflow", "📦 Using cached images (all files verified to exist)");
            downloadedImages = cachedImages;
        } else {
            await progress.update({
                step: "Downloading Images",
                message: `Searching and downloading ${imageQueries.length} images...`,
                current: 0,
                total: imageQueries.length,
            });

            downloadedImages = await downloadImagesForQueries(imageQueries, style);
            validateDownloadedImages(downloadedImages);

            // Save to style-specific cache
            // Note: imageQueries may have been rewritten if prompts were flagged as unsafe
            updateStyleCache(audioHash, style.id, style.orientation, style.multiImageSegments, {
                image_queries: JSON.stringify(imageQueries),
                downloaded_images: JSON.stringify(downloadedImages),
            });

            logger.step("Workflow", `Downloaded ${downloadedImages.length} images and cached`);
        }

        // =============================================================
        // STEP 6: VIDEO GENERATION (Always regenerate, never cached)
        // =============================================================
        await progress.update({
            step: "Generating Video",
            message: "Creating video with FFmpeg...\\nThis may take a few minutes for long videos.",
        });
        validateVideoInputs(downloadedImages, audioFilePath);
        const outputFileName = path.parse(audioFilePath).name;
        const videoResult = await generateVideo(downloadedImages, audioFilePath, transcriptWords, segments, outputFileName, style);
        logger.step("Workflow", "Video created", videoResult.videoPath);

        const result: WorkflowResult = {
            videoPath: videoResult.videoPath,
            duration: videoResult.duration,
        };

        // Step 7: Upload to MinIO (if enabled)
        if (MINIO.enabled) {
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
     * @param result - Workflow result
     * @param style - Resolved style configuration
     */
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
