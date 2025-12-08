/**
 * Test workflow script for local development
 * Runs the complete YouTube automation workflow without Telegram bot
 * Uses SQLite cache to avoid wasting API credits
 *
 * Usage:
 *   bun test-workflow.ts <audio-file-path>
 *   bun test-workflow.ts  (uses first file in tmp/audio/)
 */

import { transcribeAudio } from "./src/services/assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./src/services/transcript.ts";
import { generateImageQueries, validateImageQueries } from "./src/services/llm.ts";
import { downloadImagesForQueries, validateDownloadedImages } from "./src/services/images.ts";
import { generateVideo, validateVideoInputs } from "./src/services/video.ts";
import { uploadVideoToMinIO } from "./src/services/minio.ts";
import { TMP_AUDIO_DIR, MINIO_ENABLED } from "./src/constants.ts";
import { getDefaultStyle, resolveStyle } from "./src/styles/index.ts";
import {
  hashAudioFile,
  updateCache,
  getCachedTranscript,
  getCachedSegments,
  getCachedImageQueries,
  getCachedImages,
  initDatabase,
} from "./src/services/cache.ts";
import type { AssemblyAIWord, TranscriptSegment, ImageSearchQuery, DownloadedImage } from "./src/types.ts";
import * as logger from "./src/logger.ts";
import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Get audio file path from command line argument or find first file in tmp/audio/
 * @returns Path to audio file
 */
async function getAudioFilePath(): Promise<string> {
  // Check if audio file path provided as command line argument
  const argPath = process.argv[2];

  if (argPath) {
    const fullPath = join(process.cwd(), argPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Audio file not found: ${fullPath}`);
    }
    logger.log("Test", `Using audio file from argument: ${fullPath}`);
    return fullPath;
  }

  // Find first audio file in tmp/audio/ directory
  logger.log("Test", `No audio file specified, searching in ${TMP_AUDIO_DIR}`);

  if (!existsSync(TMP_AUDIO_DIR)) {
    throw new Error(`Audio directory not found: ${TMP_AUDIO_DIR}. Please create it and add an audio file.`);
  }

  const files = await readdir(TMP_AUDIO_DIR);
  const audioFiles = files.filter(file => {
    const ext = file.toLowerCase();
    return ext.endsWith('.mp3') ||
      ext.endsWith('.wav') ||
      ext.endsWith('.ogg') ||
      ext.endsWith('.m4a') ||
      ext.endsWith('.flac') ||
      ext.endsWith('.aac');
  });

  if (audioFiles.length === 0) {
    throw new Error(`No audio files found in ${TMP_AUDIO_DIR}. Please add an audio file to test.`);
  }

  const audioFile = audioFiles[0]!;
  const fullPath = join(TMP_AUDIO_DIR, audioFile);
  logger.log("Test", `Found audio file: ${audioFile}`);
  return fullPath;
}

/**
 * Run the complete workflow with SQLite caching
 */
async function runTestWorkflow(): Promise<void> {
  const startTime = Date.now();

  logger.log("Test", "=".repeat(60));
  logger.log("Test", "🧪 Starting Test Workflow (with SQLite Cache)");
  logger.log("Test", "=".repeat(60));

  try {
    // Initialize cache database
    initDatabase();
    logger.log("Test", "📦 SQLite cache initialized");

    // Step 1: Get audio file path
    logger.step("Test", "Step 1: Getting audio file");
    const audioFilePath = await getAudioFilePath();
    const outputFileName = path.parse(audioFilePath).name;
    logger.success("Test", `Audio file: ${audioFilePath}`);

    // Hash the audio file for cache lookup
    const audioHash = await hashAudioFile(audioFilePath);
    logger.log("Test", `Audio hash: ${audioHash.substring(0, 12)}...`);

    // Initialize cache entry
    updateCache(audioHash, {
      audio_filename: basename(audioFilePath),
      audio_path: audioFilePath,
    });

    // Use default style for testing
    const style = resolveStyle(getDefaultStyle(), {});
    logger.log("Test", `Using style: ${style.name}`);

    // =============================================================
    // Step 2: Transcription (check cache first)
    // =============================================================
    logger.step("Test", "Step 2: Transcription");

    let transcriptWords: AssemblyAIWord[];
    let audioDuration: number | null;

    const cachedTranscript = getCachedTranscript(audioHash);

    if (cachedTranscript) {
      logger.log("Test", "📦 Using cached transcript (no API call)");
      transcriptWords = cachedTranscript.words;
      audioDuration = cachedTranscript.audioDuration;
      logger.success("Test", `Loaded ${transcriptWords.length} words from cache`);
    } else {
      logger.log("Test", "🔄 No cache - calling AssemblyAI...");
      const transcript = await transcribeAudio(audioFilePath);
      transcriptWords = transcript.words;
      audioDuration = transcript.audio_duration;

      // Save to cache
      updateCache(audioHash, {
        transcript_id: transcript.id,
        transcript_words: JSON.stringify(transcript.words),
        audio_duration: transcript.audio_duration ?? undefined,
      });

      logger.success("Test", `Transcribed ${transcriptWords.length} words and cached`);
    }

    validateTranscriptData(transcriptWords);

    // =============================================================
    // Step 3: Segmentation (check cache first, style-specific)
    // =============================================================
    logger.step("Test", "Step 3: Segmentation");

    let segments: TranscriptSegment[];
    let formattedTranscript: string;

    const cachedSegments = getCachedSegments(audioHash, style.id);

    if (cachedSegments) {
      logger.log("Test", "📦 Using cached segments (same style)");
      segments = cachedSegments.segments;
      formattedTranscript = cachedSegments.formattedTranscript;
      logger.success("Test", `Loaded ${segments.length} segments from cache`);
    } else {
      logger.log("Test", "🔄 Processing transcript into segments...");
      const result = processTranscript(transcriptWords, audioDuration, style);
      segments = result.segments;
      formattedTranscript = result.formattedTranscript;

      // Save to cache
      updateCache(audioHash, {
        segments: JSON.stringify(segments),
        formatted_transcript: formattedTranscript,
        style_id: style.id,
      });

      logger.success("Test", `Created ${segments.length} segments and cached`);
    }

    // =============================================================
    // Step 4: LLM Image Queries (check cache first, style-specific)
    // =============================================================
    logger.step("Test", "Step 4: Generating image queries");

    let imageQueries: ImageSearchQuery[];

    const cachedQueries = getCachedImageQueries(audioHash, style.id);

    if (cachedQueries) {
      logger.log("Test", "📦 Using cached image queries (no LLM call)");
      imageQueries = cachedQueries;
      logger.success("Test", `Loaded ${imageQueries.length} queries from cache`);
    } else {
      logger.log("Test", "🔄 Calling LLM to generate queries...");
      imageQueries = await generateImageQueries(formattedTranscript, style);
      validateImageQueries(imageQueries);

      // Save to cache
      updateCache(audioHash, {
        image_queries: JSON.stringify(imageQueries),
      });

      logger.success("Test", `Generated ${imageQueries.length} queries and cached`);
    }

    // Validate query count matches segment count
    if (imageQueries.length !== segments.length) {
      throw new Error(
        `Mismatch: Expected ${segments.length} queries (one per segment), but got ${imageQueries.length} queries from LLM`
      );
    }

    // =============================================================
    // Step 5: Download Images (check cache first)
    // =============================================================
    logger.step("Test", "Step 5: Downloading images");

    let downloadedImages: DownloadedImage[];

    const cachedImages = getCachedImages(audioHash);

    if (cachedImages && cachedImages.length === imageQueries.length) {
      logger.log("Test", "📦 Using cached images (all files verified)");
      downloadedImages = cachedImages;
      logger.success("Test", `Loaded ${downloadedImages.length} images from cache`);
    } else {
      logger.log("Test", "🔄 Downloading images...");
      downloadedImages = await downloadImagesForQueries(imageQueries, style);
      validateDownloadedImages(downloadedImages);

      // Save to cache
      updateCache(audioHash, {
        downloaded_images: JSON.stringify(downloadedImages),
      });

      logger.success("Test", `Downloaded ${downloadedImages.length} images and cached`);
    }

    // =============================================================
    // Step 6: Generate Video (always regenerate)
    // =============================================================
    logger.step("Test", "Step 6: Generating video (always fresh)");
    validateVideoInputs(downloadedImages, audioFilePath);

    const videoResult = await generateVideo(
      downloadedImages,
      audioFilePath,
      transcriptWords,
      segments,
      outputFileName,
      style
    );
    logger.success("Test", `Video generated: ${videoResult.videoPath}`);

    // Step 7: Upload to MinIO (if enabled)
    if (MINIO_ENABLED) {
      logger.step("Test", "Step 7: Uploading to MinIO");
      const minioResult = await uploadVideoToMinIO(videoResult.videoPath);

      if (minioResult.success) {
        logger.success("Test", `Uploaded to MinIO: ${minioResult.url}`);
      } else {
        logger.warn("Test", `MinIO upload failed: ${minioResult.error}`);
      }
    }

    // Summary
    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    logger.log("Test", "=".repeat(60));
    logger.log("Test", "✅ Test Workflow Completed!");
    logger.log("Test", "=".repeat(60));
    logger.log("Test", `📊 Summary:`);
    logger.log("Test", `   • Audio: ${basename(audioFilePath)}`);
    logger.log("Test", `   • Style: ${style.name}`);
    logger.log("Test", `   • Segments: ${segments.length}`);
    logger.log("Test", `   • Duration: ${videoResult.duration.toFixed(2)}s`);
    logger.log("Test", `   • Video: ${videoResult.videoPath}`);
    logger.log("Test", `   • Time: ${totalTime}s`);
    logger.log("Test", "=".repeat(60));

  } catch (error) {
    logger.error("Test", "Test workflow failed", error);
    process.exit(1);
  }
}

// Run the test workflow
runTestWorkflow();
