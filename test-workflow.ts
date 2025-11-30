/**
 * Test workflow script for local development
 * Runs the complete YouTube automation workflow without Telegram bot
 * Supports caching to avoid wasting AssemblyAI credits
 *
 * Usage:
 *   bun test-workflow.ts <audio-file-path>
 *   bun test-workflow.ts  (uses first file in tmp/audio/)
 */

/**
 * ASSEMBLYAI TRANSCRIPT CACHE
 *
 * To avoid wasting credits by re-transcribing the same audio file during testing:
 *
 * Priority order (checked in this order):
 * 1. TRANSCRIPT_ID - If set, fetches existing transcript directly (no upload, no transcription)
 * 2. UPLOAD_URL - If set, skips upload but requests new transcription (uses 1 credit)
 * 3. Neither set - Uploads audio and requests transcription (uses 1 credit)
 *
 * Usage:
 * 1. First run (or when testing new audio file):
 *    - Leave both empty: const TRANSCRIPT_ID = ""; const UPLOAD_URL = "";
 *    - The workflow will upload and transcribe, then log both values
 *
 * 2. Subsequent runs with same audio file (BEST - saves credits):
 *    - Copy the transcript ID: const TRANSCRIPT_ID = "abc123...";
 *    - This fetches the existing transcript without using any credits
 *
 * 3. If you need to re-transcribe with different settings:
 *    - Use upload URL only: const UPLOAD_URL = "https://cdn.assemblyai.com/upload/...";
 *    - This skips upload but creates new transcription (uses 1 credit)
 *
 * Examples:
 *   const TRANSCRIPT_ID = "abc123def456";  // Best option - no credits used
 *   const UPLOAD_URL = "https://cdn.assemblyai.com/upload/a20e52fb-4a09-4d2f-aafe-e65edda37cac";
 */
const TRANSCRIPT_ID: string = "1ecad84a-dc21-46dc-8afa-3a93b3ef484e";
const UPLOAD_URL: string = "";

import { requestTranscription, pollForCompletion, uploadAudio, getTranscript } from "./src/services/assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./src/services/transcript.ts";
import { generateImageQueries, validateImageQueries } from "./src/services/llm.ts";
import { downloadImagesForQueries, validateDownloadedImages } from "./src/services/images.ts";
import { generateVideo, validateVideoInputs } from "./src/services/video.ts";
import { uploadVideoToMinIO } from "./src/services/minio.ts";
import { TMP_AUDIO_DIR, MINIO_ENABLED } from "./src/constants.ts";
import { getDefaultStyle, resolveStyle } from "./src/styles/index.ts";
import * as logger from "./src/logger.ts";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
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

  const audioFile = audioFiles[0]!; // Safe because we checked length > 0
  const fullPath = join(TMP_AUDIO_DIR, audioFile);
  logger.log("Test", `Found audio file: ${audioFile}`);
  return fullPath;

}

/**
 * Run the complete workflow
 */
async function runTestWorkflow(): Promise<void> {
  const startTime = Date.now();

  logger.log("Test", "=".repeat(60));
  logger.log("Test", "🧪 Starting Test Workflow");
  logger.log("Test", "=".repeat(60));

  try {
    let audioFilePath: string;
    let transcript;
    let outputFileName = "output_video";

    // Step 1: Determine audio source and get transcript
    logger.step("Test", "Step 1: Determining audio source");

    // Priority 1: Check if we have a cached transcript ID (best - no credits used)
    if (TRANSCRIPT_ID && TRANSCRIPT_ID.trim() !== "") {
      logger.log("Test", "🎯 Using cached transcript ID (fetching existing transcript - no credits used)");
      logger.debug("Test", `Transcript ID: ${TRANSCRIPT_ID}`);

      // Fetch existing transcript directly
      transcript = await getTranscript(TRANSCRIPT_ID);
      logger.success("Test", "✅ Transcript fetched successfully!");
      logger.log("Test", `📊 Status: ${transcript.status}`);

      // Use local audio file (AssemblyAI CDN URLs expire, so we need local copy)
      audioFilePath = await getAudioFilePath();
      logger.log("Test", `🔗 Using local audio file: ${audioFilePath}`);
      outputFileName = `video_${TRANSCRIPT_ID}`;

      // Priority 2: Check if we have a cached upload URL (skips upload, uses 1 credit)
    } else if (UPLOAD_URL && UPLOAD_URL.trim() !== "") {
      logger.log("Test", "📦 Using cached upload URL (skipping upload, requesting transcription - uses 1 credit)");
      logger.debug("Test", `Upload URL: ${UPLOAD_URL}`);

      audioFilePath = UPLOAD_URL;
      outputFileName = `video_upload_${Date.now()}`;

      // Skip upload, use cached URL directly for transcription
      const transcriptResponse = await requestTranscription(UPLOAD_URL);
      logger.log("Test", "💡 TIP: To avoid using credits in future runs, copy this transcript ID:");
      logger.log("Test", `📋 TRANSCRIPT_ID = "${transcriptResponse.id}";`);
      logger.log("Test", "");

      // Poll for completion
      if (transcriptResponse.status === "completed") {
        logger.success("Test", "Transcription already completed");
        transcript = transcriptResponse;
      } else {
        transcript = await pollForCompletion(transcriptResponse.id);
      }

      // Priority 3: No cache - find local file, upload and transcribe (uses 1 credit)
    } else {
      logger.log("Test", "📂 No cache found - searching for local audio file");

      // Find local file
      audioFilePath = await getAudioFilePath();
      logger.success("Test", `Local audio file found: ${audioFilePath}`);
      outputFileName = path.parse(audioFilePath).name;

      logger.log("Test", "📤 Uploading audio and requesting transcription (uses 1 credit)");

      // Upload the audio file
      const uploadUrl = await uploadAudio(audioFilePath);
      logger.success("Test", "✅ Audio uploaded successfully!");

      // Request transcription
      const transcriptResponse = await requestTranscription(uploadUrl);

      logger.log("Test", "");
      logger.log("Test", "💡 TIP: To save credits in future test runs, copy these values:");
      logger.log("Test", `📋 TRANSCRIPT_ID = "${transcriptResponse.id}";  // Best option - no credits used`);
      logger.log("Test", `📋 UPLOAD_URL = "${uploadUrl}";  // Alternative - skips upload but uses 1 credit`);
      logger.log("Test", "");

      // Poll for completion
      if (transcriptResponse.status === "completed") {
        logger.success("Test", "Transcription already completed");
        transcript = transcriptResponse;
      } else {
        transcript = await pollForCompletion(transcriptResponse.id);
      }
    }

    if (!transcript || !transcript.words || transcript.words.length === 0) {
      throw new Error("Transcription returned no words");
    }

    logger.success("Test", `Transcription completed: ${transcript.words.length} words`);
    logger.debug("Test", `Transcript text: ${transcript.text?.substring(0, 100)}...`);

    // Step 3: Validate and process transcript
    logger.step("Test", "Step 3: Processing transcript into segments");
    validateTranscriptData(transcript.words);
    // Use default style for testing
    const style = resolveStyle(getDefaultStyle(), {});
    const { segments, formattedTranscript } = processTranscript(transcript.words, transcript.audio_duration, style);
    logger.success("Test", `Created ${segments.length} segments (style: ${style.name})`);

    // Step 4: Generate image search queries with LLM
    logger.step("Test", "Step 4: Generating image queries");
    const imageQueries = await generateImageQueries(formattedTranscript, style);
    validateImageQueries(imageQueries);
    logger.success("Test", `Generated ${imageQueries.length} image queries`);

    // Validate that we have exactly one query per segment
    if (imageQueries.length !== segments.length) {
      throw new Error(
        `Mismatch: Expected ${segments.length} queries (one per segment), but got ${imageQueries.length} queries from LLM`
      );
    }

    // Step 5: Search and download images
    logger.step("Test", "Step 5: Downloading images");
    const downloadedImages = await downloadImagesForQueries(imageQueries, style);
    validateDownloadedImages(downloadedImages);
    logger.success("Test", `Downloaded ${downloadedImages.length} images`);

    // Step 6: Generate video with FFmpeg
    logger.step("Test", "Step 6: Generating video");
    validateVideoInputs(downloadedImages, audioFilePath);

    const videoResult = await generateVideo(downloadedImages, audioFilePath, transcript.words, segments, outputFileName, style);
    logger.success("Test", `Video generated successfully!`);
    logger.log("Test", `Video saved at: ${videoResult.videoPath}`);

    // Step 7: Upload to MinIO (if enabled)
    if (MINIO_ENABLED) {
      logger.step("Test", "Step 7: Uploading to MinIO");
      const minioResult = await uploadVideoToMinIO(videoResult.videoPath);

      if (minioResult.success) {
        logger.success("Test", `Video uploaded to MinIO: ${minioResult.url}`);
        logger.log("Test", `Bucket: ${minioResult.bucket}`);
        logger.log("Test", `Object key: ${minioResult.objectKey}`);
      } else {
        logger.warn("Test", `MinIO upload failed: ${minioResult.error}`);
      }
    }

    // Summary
    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    logger.log("Test", "=".repeat(60));
    logger.log("Test", "✅ Test Workflow Completed Successfully!");
    logger.log("Test", "=".repeat(60));
    logger.log("Test", `📊 Summary:`);
    logger.log("Test", `   • Audio source: ${audioFilePath.startsWith('http') ? 'Remote URL' : 'Local File'}`);
    logger.log("Test", `   • Video duration: ${videoResult.duration.toFixed(2)} seconds`);
    logger.log("Test", `   • Video path: ${videoResult.videoPath}`);
    logger.log("Test", `   • Total processing time: ${totalTime} seconds`);
    logger.log("Test", "=".repeat(60));

  } catch (error) {
    logger.error("Test", "Test workflow failed", error);
    process.exit(1);
  }
}

// Run the test workflow
runTestWorkflow();
