/**
 * Video generation service using FFmpeg
 * Supports configurable pan effects and caption styles via style system
 */

import { TMP_VIDEO_DIR, IMAGES_PER_CHUNK } from "../constants.ts";
// Note: PAN_EFFECT and CAPTIONS_ENABLED are now handled by the style system
import type { DownloadedImage, VideoGenerationResult, AssemblyAIWord, TranscriptSegment } from "../types.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as logger from "../logger.ts";
import { generateCaptions } from "./captions.ts";
import { createFilterComplex } from "../utils/ffmpeg.ts";

// Module-level style reference for video generation
// Set by generateVideo and used by helper functions
let currentStyle: ResolvedStyle | null = null;

/**
 * Generate video from images and audio using FFmpeg with chunked rendering
 * @param images - Array of downloaded images with timing information
 * @param audioFilePath - Path to the audio file
 * @param words - Word-level data from AssemblyAI
 * @param segments - Transcript segments
 * @param outputFileName - Output filename (without extension)
 * @param style - Resolved style configuration
 * @returns Video generation result with path and duration
 */
export async function generateVideo(
  images: DownloadedImage[],
  audioFilePath: string,
  words: AssemblyAIWord[],
  segments: TranscriptSegment[],
  outputFileName: string,
  style: ResolvedStyle
): Promise<VideoGenerationResult> {
  // Store style for use by helper functions
  currentStyle = style;

  const panEffect = style.panEffect;
  const captionsEnabled = style.captionsEnabled;

  logger.step("Video", `Generating video from ${images.length} images`);
  logger.debug("Video", `Audio file: ${audioFilePath}`);
  logger.debug("Video", `Style: ${style.name} (${style.id})`);

  if (panEffect) {
    logger.log("Video", "🎬 Pan effect enabled - applying subtle vertical motion to images");
  } else {
    logger.log("Video", "📷 Pan effect disabled - using static images");
  }

  if (captionsEnabled) {
    logger.log("Video", "📝 Captions enabled - adding word-by-word highlighted subtitles");
  } else {
    logger.log("Video", "📝 Captions disabled - video only");
  }

  // Sort images by start time to ensure correct order
  const sortedImages = [...images].sort((a, b) => a.start - b.start);

  // Calculate total duration
  let totalDuration = 0;
  for (const image of sortedImages) {
    totalDuration += (image.end - image.start) / 1000;
  }

  // Generate output filename
  const finalOutputFilename = `${outputFileName}.mp4`;
  const outputPath = join(TMP_VIDEO_DIR, finalOutputFilename);

  // Decide whether to use chunked rendering or single-pass rendering
  if (sortedImages.length > IMAGES_PER_CHUNK) {
    logger.step("Video", `Using chunked rendering (${IMAGES_PER_CHUNK} images per chunk) to prevent memory exhaustion`);
    await renderVideoInChunks(sortedImages, audioFilePath, outputPath, words, segments, style);
  } else {
    logger.step("Video", `Using single-pass rendering (${sortedImages.length} images)`);
    const { filterComplex } = createFilterComplex(sortedImages, panEffect);
    let assFilePath: string | undefined;
    if (captionsEnabled) {
      const captionResult = await generateCaptions(segments, words, style);
      assFilePath = captionResult.assFilePath;
    }
    await runFFmpeg(sortedImages, audioFilePath, filterComplex, outputPath, assFilePath);
  }

  logger.success("Video", `Video generated successfully`);
  logger.debug("Video", `Output: ${outputPath}`);
  logger.debug("Video", `Total duration: ${totalDuration.toFixed(2)} seconds`);

  return {
    videoPath: outputPath,
    duration: totalDuration,
  };
}

/**
 * Run FFmpeg command to generate video
 * @param images - Array of images
 * @param audioFilePath - Path to audio file
 * @param filterComplex - FFmpeg filter complex string
 * @param outputPath - Output video path
 * @param assFilePath - Optional path to ASS subtitle file
 */
async function runFFmpeg(
  images: DownloadedImage[],
  audioFilePath: string,
  filterComplex: string,
  outputPath: string,
  assFilePath?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Build input arguments
    const inputArgs: string[] = [];

    // Add image inputs with loop and duration
    const imagesLength = images.length;
    for (let i = 0; i < imagesLength; i++) {
      const image = images[i];
      if (!image) continue;

      const duration = (image.end - image.start) / 1000; // Convert ms to seconds

      inputArgs.push(
        "-loop",
        "1",
        "-t",
        duration.toString(),
        "-i",
        image.filePath
      );
    }

    // Add audio input
    inputArgs.push("-i", audioFilePath);

    // Modify filter complex to add subtitles if ASS file is provided
    // Use currentStyle to check if captions are enabled (set by generateVideo)
    let finalFilterComplex = filterComplex;
    if (currentStyle?.captionsEnabled && assFilePath) {
      // Add subtitles filter after the video output
      // Replace [outv] with intermediate output, then apply subtitles
      finalFilterComplex = filterComplex.replace("[outv]", "[video_no_subs]");
      // Escape the ASS file path for Windows (replace backslashes with forward slashes and escape colons)
      const escapedAssPath = assFilePath.replace(/\\/g, "/").replace(/:/g, "\\:");
      // NOTE: Do NOT use force_style parameter - it overrides inline styling tags in the ASS file
      // The ASS file already contains all the styling information for word-by-word highlighting
      finalFilterComplex += `;[video_no_subs]subtitles='${escapedAssPath}'[outv]`;
    }

    // Build complete FFmpeg arguments with memory-efficient settings
    const ffmpegArgs = [
      ...inputArgs,
      "-filter_complex",
      finalFilterComplex,
      "-map",
      "[outv]",
      "-map",
      `${imagesLength}:a`, // Map audio from the last input (audio file)
      "-c:v",
      "libx264",
      "-preset",
      "veryfast", // Changed from "medium" to "veryfast" for lower memory usage
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      // Memory optimization flags
      "-max_muxing_queue_size",
      "1024", // Prevent buffer overflow
      "-bufsize",
      "2M", // Control buffer size to 2MB
      "-threads",
      "2", // Limit to 2 threads to reduce memory overhead
      // Additional stability flags
      "-fflags",
      "+genpts+igndts", // Improve timestamp handling
      "-avoid_negative_ts",
      "make_zero", // Prevent timestamp issues
      // NOTE: Removed -shortest flag to prevent premature video cutoff
      // The video duration is controlled by the filter_complex concat filter
      "-y", // Overwrite output file
      outputPath,
    ];

    logger.step("Video", `Running FFmpeg with ${images.length} images`);
    logger.debug("Video", `Full FFmpeg command: ffmpeg ${ffmpegArgs.join(" ")}`);

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let stderrOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      const output = data.toString();
      stderrOutput += output;
      // Log progress (only in debug mode)
      if (output.includes("time=")) {
        const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch) {
          logger.debug("Video", `Progress: ${timeMatch[1]}`);
        }
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        logger.success("Video", "FFmpeg completed successfully");
        resolve();
      } else {
        // Enhanced error logging
        logger.error("Video", `FFmpeg exited with code ${code}`);

        // In debug mode, show full stderr output
        logger.debug("Video", `FFmpeg stderr:\n${stderrOutput}`);

        // In lite mode, show brief error message
        if (code === 244) {
          logger.error("Video", "Exit code 244 indicates memory exhaustion. Try reducing image count or quality.");
        }

        reject(new Error(`FFmpeg exited with code ${code}. ${code === 244 ? "Memory exhaustion detected." : ""}`));
      }
    });

    ffmpeg.on("error", (error) => {
      logger.error("Video", `Failed to start FFmpeg: ${error.message}`);
      reject(new Error(`Failed to start FFmpeg: ${error.message}`));
    });
  });
}

/**
 * Render video in chunks to prevent memory exhaustion
 * @param images - Sorted array of images
 * @param audioFilePath - Path to audio file
 * @param outputPath - Final output video path
 * @param words - Word-level data from AssemblyAI
 * @param segments - Transcript segments
 * @param style - Resolved style configuration
 */
async function renderVideoInChunks(
  images: DownloadedImage[],
  audioFilePath: string,
  outputPath: string,
  words: AssemblyAIWord[],
  segments: TranscriptSegment[],
  style: ResolvedStyle
): Promise<void> {
  const panEffect = style.panEffect;
  const captionsEnabled = style.captionsEnabled;

  // Split images into chunks
  const chunks: DownloadedImage[][] = [];
  for (let i = 0; i < images.length; i += IMAGES_PER_CHUNK) {
    chunks.push(images.slice(i, i + IMAGES_PER_CHUNK));
  }

  logger.step("Video", `Split ${images.length} images into ${chunks.length} chunks`);

  // Render each chunk as a separate video
  const chunkPaths: string[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk || chunk.length === 0) continue;

    logger.step("Video", `Rendering chunk ${i + 1}/${chunks.length} (${chunk.length} images)...`);

    // Calculate audio segment timing for this chunk
    const chunkStartTime = chunk[0]!.start;
    const chunkEndTime = chunk[chunk.length - 1]!.end;
    const chunkDuration = (chunkEndTime - chunkStartTime) / 1000;

    // Generate chunk output path
    const chunkPath = join(TMP_VIDEO_DIR, `chunk_${timestamp}_${i}.mp4`);
    chunkPaths.push(chunkPath);

    // Create filter complex for this chunk
    const { filterComplex } = createFilterComplex(chunk, panEffect);

    let chunkAssPath: string | undefined;
    if (captionsEnabled) {
      // Filter words and segments for this chunk
      const chunkWords = words.filter(w => w.start >= chunkStartTime && w.end <= chunkEndTime);
      const chunkSegments = segments.filter(s => s.start >= chunkStartTime && s.end <= chunkEndTime);

      if (chunkWords.length > 0 && chunkSegments.length > 0) {
        // Make timestamps relative to the chunk start time
        const relativeWords = chunkWords.map(w => ({ ...w, start: w.start - chunkStartTime, end: w.end - chunkStartTime }));
        const relativeSegments = chunkSegments.map(s => ({ ...s, start: s.start - chunkStartTime, end: s.end - chunkStartTime }));

        const captionResult = await generateCaptions(relativeSegments, relativeWords, style, `captions_${timestamp}_${i}.ass`);
        chunkAssPath = captionResult.assFilePath;
      }
    }

    // Render this chunk with the corresponding audio segment and captions
    await runFFmpegChunk(chunk, audioFilePath, filterComplex, chunkPath, chunkStartTime / 1000, chunkDuration, chunkAssPath);

    logger.success("Video", `Chunk ${i + 1}/${chunks.length} completed`);
  }

  // Concatenate all chunks into final video
  logger.step("Video", `Concatenating ${chunks.length} chunks into final video...`);
  await concatenateChunks(chunkPaths, outputPath);

  // Cleanup chunk files and temporary ASS files
  logger.debug("Video", `Cleaning up ${chunkPaths.length} temporary chunk and caption files...`);
  for (const chunkPath of chunkPaths) {
    try {
      await unlink(chunkPath);
      logger.debug("Video", `Deleted ${chunkPath}`);

      const assPath = chunkPath.replace('.mp4', '.ass').replace('chunk_', 'captions_');
      if (existsSync(assPath)) {
        await unlink(assPath);
        logger.debug("Video", `Deleted ${assPath}`);
      }
    } catch (error) {
      logger.warn("Video", `Failed to delete chunk file ${chunkPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  logger.success("Video", `Chunked rendering completed successfully`);
}

/**
 * Run FFmpeg for a single chunk with audio segment
 * @param images - Array of images for this chunk
 * @param audioFilePath - Path to audio file
 * @param filterComplex - FFmpeg filter complex string
 * @param outputPath - Output path for this chunk
 * @param audioStartTime - Start time in audio file (seconds)
 * @param audioDuration - Duration of audio segment (seconds)
 * @param assFilePath - Optional path to ASS subtitle file for this chunk
 */
async function runFFmpegChunk(
  images: DownloadedImage[],
  audioFilePath: string,
  filterComplex: string,
  outputPath: string,
  audioStartTime: number,
  audioDuration: number,
  assFilePath?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Build input arguments
    const inputArgs: string[] = [];

    // Add image inputs with loop and duration
    const imagesLength = images.length;
    for (let i = 0; i < imagesLength; i++) {
      const image = images[i];
      if (!image) continue;

      const duration = (image.end - image.start) / 1000; // Convert ms to seconds

      inputArgs.push(
        "-loop",
        "1",
        "-t",
        duration.toString(),
        "-i",
        image.filePath
      );
    }

    // Add audio input with seek and duration
    inputArgs.push(
      "-ss",
      audioStartTime.toString(),
      "-t",
      audioDuration.toString(),
      "-i",
      audioFilePath
    );

    // Modify filter complex to add subtitles if ASS file is provided
    // Use currentStyle to check if captions are enabled (set by generateVideo)
    let finalFilterComplex = filterComplex;
    if (currentStyle?.captionsEnabled && assFilePath) {
      finalFilterComplex = filterComplex.replace("[outv]", "[video_no_subs]");
      const escapedAssPath = assFilePath.replace(/\\/g, "/").replace(/:/g, "\\:");
      finalFilterComplex += `;[video_no_subs]subtitles='${escapedAssPath}'[outv]`;
    }

    // Build complete FFmpeg arguments with memory-efficient settings
    const ffmpegArgs = [
      ...inputArgs,
      "-filter_complex",
      finalFilterComplex,
      "-map",
      "[outv]",
      "-map",
      `${imagesLength}:a`, // Map audio from the last input (audio file)
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      // Memory optimization flags
      "-max_muxing_queue_size",
      "1024",
      "-bufsize",
      "2M",
      "-threads",
      "2",
      // Additional stability flags
      "-fflags",
      "+genpts+igndts",
      "-avoid_negative_ts",
      "make_zero",
      // NOTE: Removed -shortest flag to prevent premature video cutoff
      "-y",
      outputPath,
    ];

    logger.debug("Video", `FFmpeg chunk command: ffmpeg ${ffmpegArgs.join(" ")}`);

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let stderrOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      const output = data.toString();
      stderrOutput += output;
      // Log progress (only in debug mode)
      if (output.includes("time=")) {
        const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (timeMatch) {
          logger.debug("Video", `Chunk progress: ${timeMatch[1]}`);
        }
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        logger.debug("Video", "Chunk FFmpeg completed successfully");
        resolve();
      } else {
        logger.error("Video", `Chunk FFmpeg exited with code ${code}`);
        logger.debug("Video", `FFmpeg stderr:\n${stderrOutput}`);

        if (code === 244) {
          logger.error("Video", "Exit code 244 indicates memory exhaustion even with chunking. Try reducing IMAGES_PER_CHUNK.");
        }

        reject(new Error(`FFmpeg chunk exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (error) => {
      logger.error("Video", `Failed to start FFmpeg chunk: ${error.message}`);
      reject(new Error(`Failed to start FFmpeg chunk: ${error.message}`));
    });
  });
}

/**
 * Concatenate multiple video chunks into a single video
 * @param chunkPaths - Array of chunk video file paths
 * @param outputPath - Final output video path
 */
async function concatenateChunks(
  chunkPaths: string[],
  outputPath: string
): Promise<void> {
  // Create concat list file
  const concatListPath = join(TMP_VIDEO_DIR, `concat_list_${Date.now()}.txt`);

  // FFmpeg's concat demuxer interprets paths relative to the concat list file's location
  // Since both the concat list and chunk files are in TMP_VIDEO_DIR, use just the filename
  const concatContent = chunkPaths
    .map((path) => {
      // Extract just the filename (e.g., "chunk_1762602415888_0.mp4")
      // This avoids path duplication since concat list is in the same directory
      const filename = basename(path);
      return `file '${filename}'`;
    })
    .join("\n");

  await writeFile(concatListPath, concatContent, "utf-8");
  logger.debug("Video", `Created concat list: ${concatListPath}`);
  logger.debug("Video", `Concat list content:\n${concatContent}`);

  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy", // No re-encoding, just copy streams
      "-y",
      outputPath,
    ];

    logger.debug("Video", `FFmpeg concat command: ffmpeg ${ffmpegArgs.join(" ")}`);

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let stderrOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on("close", async (code) => {
      if (code === 0) {
        logger.success("Video", "Concatenation completed successfully");

        // Keep concat list file for reference (don't delete)
        logger.debug("Video", `Concat list file saved: ${concatListPath}`);

        resolve();
      } else {
        logger.error("Video", `Concatenation failed with code ${code}`);
        logger.debug("Video", `FFmpeg stderr:\n${stderrOutput}`);

        // Keep concat list file for debugging
        logger.warn("Video", `Concat list file kept for debugging: ${concatListPath}`);

        reject(new Error(`FFmpeg concatenation exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (error) => {
      logger.error("Video", `Failed to start FFmpeg concatenation: ${error.message}`);
      reject(new Error(`Failed to start FFmpeg concatenation: ${error.message}`));
    });
  });
}

/**
 * Validate video generation inputs
 * @param images - Array of images to validate
 * @param audioFilePath - Audio file path to validate
 * @returns True if valid, throws error otherwise
 */
export function validateVideoInputs(
  images: DownloadedImage[],
  audioFilePath: string
): boolean {
  if (!Array.isArray(images)) {
    throw new Error("Images must be an array");
  }

  if (images.length === 0) {
    throw new Error("No images provided for video generation");
  }

  if (typeof audioFilePath !== "string" || audioFilePath.length === 0) {
    throw new Error("Invalid audio file path");
  }

  logger.success(
    "Video",
    `Validation passed for ${images.length} images and audio file`
  );
  return true;
}

