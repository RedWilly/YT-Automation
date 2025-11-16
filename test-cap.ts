/**
 * Test caption synchronization script
 * Tests the caption sync fix by generating a video with captions using cached transcript
 * Bypasses image generation by using a single placeholder image for all segments
 *
 * Usage:
 *   bun test-cap.ts <audio-file-path>
 *   bun test-cap.ts  (uses first file in tmp/audio/)
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
const TRANSCRIPT_ID: string = "d6a07f53-7294-42e6-88de-ee824a2fd078";
const UPLOAD_URL: string = "";

import { requestTranscription, pollForCompletion, uploadAudio, getTranscript } from "./src/services/assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./src/services/transcript.ts";
import { generateVideo } from "./src/services/video.ts";
import { TMP_AUDIO_DIR, TMP_IMAGES_DIR } from "./src/constants.ts";
import type { DownloadedImage } from "./src/types.ts";
import * as logger from "./src/logger.ts";
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

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
 * Create a placeholder image for testing (1920x1440 solid color)
 * Uses FFmpeg to generate a simple colored image
 * @returns Path to the placeholder image
 */
async function createPlaceholderImage(): Promise<string> {
  const { spawn } = await import("node:child_process");
  
  // Ensure images directory exists
  await mkdir(TMP_IMAGES_DIR, { recursive: true });
  
  const placeholderPath = join(TMP_IMAGES_DIR, "placeholder.jpg");
  
  // Check if placeholder already exists
  if (existsSync(placeholderPath)) {
    logger.debug("Test", `Using existing placeholder image: ${placeholderPath}`);
    return placeholderPath;
  }
  
  logger.step("Test", "Creating placeholder image (1920x1440)...");
  
  // Create a 1920x1440 solid color image using FFmpeg
  // This matches the expected aspect ratio for the video generation
  const ffmpegArgs = [
    "-f", "lavfi",
    "-i", "color=c=0x2C3E50:s=1920x1440:d=1",
    "-frames:v", "1",
    "-y",
    placeholderPath
  ];
  
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);
    
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        logger.success("Test", `Placeholder image created: ${placeholderPath}`);
        resolve(placeholderPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    
    ffmpeg.on("error", (error) => {
      reject(new Error(`Failed to create placeholder image: ${error.message}`));
    });
  });
}

/**
 * Run the caption test workflow
 */
async function runCaptionTest(): Promise<void> {
  const startTime = Date.now();

  logger.log("Test", "=".repeat(60));
  logger.log("Test", "🧪 Caption Synchronization Test");
  logger.log("Test", "=".repeat(60));

  try {
    // Step 1: Get audio file path
    logger.step("Test", "Step 1: Getting audio file");
    const audioFilePath = await getAudioFilePath();
    logger.success("Test", `Audio file ready: ${audioFilePath}`);

    // Step 2: Transcribe audio with AssemblyAI (using cache)
    logger.step("Test", "Step 2: Getting transcript from AssemblyAI");

    let transcript;

    // Priority 1: Check if we have a cached transcript ID (best - no credits used)
    if (TRANSCRIPT_ID && TRANSCRIPT_ID.trim() !== "") {
      logger.log("Test", "🎯 Using cached transcript ID (fetching existing transcript - no credits used)");
      logger.debug("Test", `Transcript ID: ${TRANSCRIPT_ID}`);

      // Fetch existing transcript directly - no upload, no transcription
      transcript = await getTranscript(TRANSCRIPT_ID);
      logger.success("Test", "✅ Transcript fetched successfully!");
      logger.log("Test", `📊 Status: ${transcript.status}`);

    // Priority 2: Check if we have a cached upload URL (skips upload, uses 1 credit)
    } else if (UPLOAD_URL && UPLOAD_URL.trim() !== "") {
      logger.log("Test", "📦 Using cached upload URL (skipping upload, requesting transcription - uses 1 credit)");
      logger.debug("Test", `Upload URL: ${UPLOAD_URL}`);

      // Skip upload, use cached URL directly for transcription
      const transcriptResponse = await requestTranscription(UPLOAD_URL);
      logger.log("Test", "💡 TIP: To avoid using credits in future runs, copy this transcript ID:");
      logger.log("Test", `📋 TRANSCRIPT_ID = "${transcriptResponse.id}";`);
      logger.log("Test", "");

      // Poll for completion if not already completed
      if (transcriptResponse.status === "completed") {
        logger.success("Test", "Transcription already completed");
        transcript = transcriptResponse;
      } else {
        transcript = await pollForCompletion(transcriptResponse.id);
      }

    // Priority 3: No cache - upload and transcribe (uses 1 credit)
    } else {
      logger.log("Test", "📤 No cache found - uploading audio and requesting transcription (uses 1 credit)");

      // Upload the audio file
      const uploadUrl = await uploadAudio(audioFilePath);
      logger.success("Test", "✅ Audio uploaded successfully!");

      // Request transcription with the new upload URL
      const transcriptResponse = await requestTranscription(uploadUrl);

      logger.log("Test", "");
      logger.log("Test", "💡 TIP: To save credits in future test runs, copy these values:");
      logger.log("Test", `📋 TRANSCRIPT_ID = "${transcriptResponse.id}";  // Best option - no credits used`);
      logger.log("Test", `📋 UPLOAD_URL = "${uploadUrl}";  // Alternative - skips upload but uses 1 credit`);
      logger.log("Test", "");

      // Poll for completion if not already completed
      if (transcriptResponse.status === "completed") {
        logger.success("Test", "Transcription already completed");
        transcript = transcriptResponse;
      } else {
        transcript = await pollForCompletion(transcriptResponse.id);
      }
    }

    if (!transcript.words || transcript.words.length === 0) {
      throw new Error("Transcription returned no words");
    }

    logger.success("Test", `Transcription completed: ${transcript.words.length} words`);
    logger.debug("Test", `Transcript text: ${transcript.text?.substring(0, 100)}...`);

    // Step 3: Validate and process transcript
    logger.step("Test", "Step 3: Processing transcript into segments");
    validateTranscriptData(transcript.words);
    const { segments } = processTranscript(transcript.words, transcript.audio_duration);
    logger.success("Test", `Created ${segments.length} segments`);

    // Step 4: Create placeholder image (bypass image generation)
    logger.step("Test", "Step 4: Creating placeholder image (bypassing image generation)");
    const placeholderImagePath = await createPlaceholderImage();
    logger.success("Test", `Placeholder image ready: ${placeholderImagePath}`);

    // Step 5: Create mock downloaded images using the placeholder
    logger.step("Test", "Step 5: Creating mock image data for all segments");
    const mockImages: DownloadedImage[] = segments.map((segment) => ({
      query: `Segment ${segment.index}`,
      start: segment.start,
      end: segment.end,
      filePath: placeholderImagePath,
    }));
    logger.success("Test", `Created ${mockImages.length} mock image entries`);

    // Step 6: Generate video with captions
    logger.step("Test", "Step 6: Generating video with captions");
    const videoResult = await generateVideo(mockImages, audioFilePath, transcript.words, segments);
    logger.success("Test", `Video generated successfully!`);
    logger.log("Test", `Video saved at: ${videoResult.videoPath}`);

    // Summary
    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    logger.log("Test", "=".repeat(60));
    logger.log("Test", "✅ Caption Test Completed Successfully!");
    logger.log("Test", "=".repeat(60));
    logger.log("Test", `📊 Summary:`);
    logger.log("Test", `   • Audio file: ${audioFilePath}`);
    logger.log("Test", `   • Words transcribed: ${transcript.words.length}`);
    logger.log("Test", `   • Segments created: ${segments.length}`);
    logger.log("Test", `   • Video duration: ${videoResult.duration.toFixed(2)} seconds`);
    logger.log("Test", `   • Video path: ${videoResult.videoPath}`);
    logger.log("Test", `   • Total processing time: ${totalTime} seconds`);
    logger.log("Test", "=".repeat(60));
    logger.log("Test", "");
    logger.log("Test", "🎯 Next Steps:");
    logger.log("Test", "   1. Open the video file and check caption synchronization");
    logger.log("Test", "   2. Verify captions appear at the correct time throughout the video");
    logger.log("Test", "   3. Check that highlighted words match the spoken audio");
    logger.log("Test", "   4. Pay special attention to sync after the 4-minute mark");
    logger.log("Test", "=".repeat(60));

  } catch (error) {
    logger.error("Test", "Caption test failed", error);
    process.exit(1);
  }
}

// Run the caption test
runCaptionTest();

