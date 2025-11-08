/**
 * Test workflow script for local development
 * Runs the complete YouTube automation workflow without Telegram bot
 * 
 * Usage:
 *   bun test-workflow.ts <audio-file-path>
 *   bun test-workflow.ts  (uses first file in tmp/audio/)
 */

import { transcribeAudio } from "./src/services/assemblyai.ts";
import { processTranscript, validateTranscriptData } from "./src/services/transcript.ts";
import { generateImageQueries, validateImageQueries } from "./src/services/deepseek.ts";
import { downloadImagesForQueries, validateDownloadedImages } from "./src/services/images.ts";
import { generateVideo, validateVideoInputs } from "./src/services/video.ts";
import { uploadToYouTube } from "./src/services/youtube.ts";
import { cleanupTempFiles } from "./src/services/cleanup.ts";
import { TMP_AUDIO_DIR, YOUTUBE_AUTO_POST } from "./src/constants.ts";
import * as logger from "./src/logger.ts";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { YouTubeUploadResult } from "./src/types.ts";

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
    // Step 1: Get audio file path
    logger.step("Test", "Step 1: Getting audio file");
    const audioFilePath = await getAudioFilePath();
    logger.success("Test", `Audio file ready: ${audioFilePath}`);

    // Step 2: Transcribe audio with AssemblyAI
    logger.step("Test", "Step 2: Transcribing audio with AssemblyAI");
    const transcript = await transcribeAudio(audioFilePath);
    
    if (!transcript.words || transcript.words.length === 0) {
      throw new Error("Transcription returned no words");
    }
    
    logger.success("Test", `Transcription completed: ${transcript.words.length} words`);
    logger.debug("Test", `Transcript text: ${transcript.text?.substring(0, 100)}...`);

    // Step 3: Validate and process transcript
    logger.step("Test", "Step 3: Processing transcript into segments");
    validateTranscriptData(transcript.words);
    const { segments, formattedTranscript } = processTranscript(transcript.words);
    logger.success("Test", `Created ${segments.length} segments`);

    // Step 4: Generate image search queries with DeepSeek
    logger.step("Test", "Step 4: Generating image search queries with DeepSeek");
    const imageQueries = await generateImageQueries(formattedTranscript);
    validateImageQueries(imageQueries);
    
    if (imageQueries.length !== segments.length) {
      logger.warn("Test", `Query count (${imageQueries.length}) doesn't match segment count (${segments.length})`);
    } else {
      logger.success("Test", `Query count matches segment count (${segments.length})`);
    }

    // Step 5: Download images from DuckDuckGo
    logger.step("Test", "Step 5: Downloading images from DuckDuckGo");
    const downloadedImages = await downloadImagesForQueries(imageQueries);
    validateDownloadedImages(downloadedImages);
    logger.success("Test", `Downloaded ${downloadedImages.length} images`);

    // Step 6: Generate video with FFmpeg
    logger.step("Test", "Step 6: Generating video with FFmpeg");
    validateVideoInputs(downloadedImages, audioFilePath);
    const videoResult = await generateVideo(downloadedImages, audioFilePath);
    logger.success("Test", `Video generated successfully!`);

    // Step 7: Conditionally upload to YouTube based on YOUTUBE_AUTO_POST
    let uploadResult: YouTubeUploadResult | null = null;

    if (YOUTUBE_AUTO_POST) {
      logger.step("Test", "Step 7: Uploading video to YouTube");
      const videoTitle = `Test Video - ${new Date().toLocaleDateString()}`;
      uploadResult = await uploadToYouTube(videoResult.videoPath, {
        title: videoTitle,
        description: "Test video generated automatically from audio transcription",
        tags: ["test", "automation", "ai-generated"],
      });
      logger.success("Test", `Video uploaded to YouTube!`);
      logger.log("Test", `YouTube URL: ${uploadResult.videoUrl}`);

      // Step 8: Cleanup temporary files (only after successful upload)
      logger.step("Test", "Step 8: Cleaning up temporary files");
      const cleanupResult = await cleanupTempFiles(false); // Delete everything including final video
      logger.success("Test", `Cleanup completed: ${cleanupResult.deletedFiles.length} files deleted`);
      logger.log("Test", `Disk space freed: ${(cleanupResult.totalSize / 1024 / 1024).toFixed(2)} MB`);
    } else {
      logger.step("Test", "Step 7: Auto-post disabled - video saved locally");
      logger.log("Test", `Video saved at: ${videoResult.videoPath}`);
      logger.log("Test", `⚠️ Auto-post is disabled. Video was not uploaded to YouTube.`);
    }

    // Summary
    const endTime = Date.now();
    const totalTime = ((endTime - startTime) / 1000).toFixed(2);

    logger.log("Test", "=".repeat(60));
    logger.log("Test", "✅ Test Workflow Completed Successfully!");
    logger.log("Test", "=".repeat(60));
    logger.log("Test", `📊 Summary:`);
    logger.log("Test", `   • Audio file: ${audioFilePath}`);
    logger.log("Test", `   • Words transcribed: ${transcript.words.length}`);
    logger.log("Test", `   • Segments created: ${segments.length}`);
    logger.log("Test", `   • Images downloaded: ${downloadedImages.length}`);
    logger.log("Test", `   • Video duration: ${videoResult.duration.toFixed(2)} seconds`);
    logger.log("Test", `   • Video path: ${videoResult.videoPath}`);

    if (YOUTUBE_AUTO_POST && uploadResult) {
      logger.log("Test", `   • YouTube URL: ${uploadResult.videoUrl}`);
      logger.log("Test", `   • Upload status: ✅ Uploaded successfully`);
    } else {
      logger.log("Test", `   • Upload status: ⚠️ Auto-post disabled - not uploaded`);
    }

    logger.log("Test", `   • Total processing time: ${totalTime} seconds`);
    logger.log("Test", "=".repeat(60));

  } catch (error) {
    logger.error("Test", "Test workflow failed", error);
    process.exit(1);
  }
}

// Run the test workflow
runTestWorkflow();

