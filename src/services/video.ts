/**
 * Video generation service using FFmpeg
 */

import { TMP_VIDEO_DIR, IMAGES_PER_CHUNK, PAN_EFFECT } from "../constants.ts";
import type { DownloadedImage, VideoGenerationResult } from "../types.ts";
import { join, basename, resolve } from "node:path";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as logger from "../logger.ts";

/**
 * Pan direction for vertical pan effect
 */
type PanDirection = "up" | "down";

/**
 * Pan parameters for zoompan filter
 */
interface PanParams {
  enabled: boolean;
  direction: PanDirection;
  yStart: number; // Starting Y position (pixels)
  yEnd: number; // Ending Y position (pixels)
}

/**
 * Calculate pan parameters based on image aspect ratio and duration
 * @param duration - Scene duration in seconds
 * @returns Pan parameters for zoompan filter
 */
function calculatePanParams(duration: number): PanParams {
  // If pan effect is disabled, return disabled params
  if (!PAN_EFFECT) {
    return {
      enabled: false,
      direction: "down",
      yStart: 0,
      yEnd: 0,
    };
  }

  // Target video dimensions
  const VIDEO_WIDTH = 1920;
  const VIDEO_HEIGHT = 1080;

  // AI-generated image dimensions (4:3 aspect ratio)
  const IMAGE_WIDTH = 1472;
  const IMAGE_HEIGHT = 1104;

  // Calculate scaled dimensions when fitting image to video width
  // The image will be scaled to fit 1920px width while maintaining aspect ratio
  const scaledHeight = (IMAGE_HEIGHT * VIDEO_WIDTH) / IMAGE_WIDTH; // = 1440px

  // Calculate total vertical headroom (extra space above and below)
  const totalHeadroom = scaledHeight - VIDEO_HEIGHT; // = 1440 - 1080 = 360px

  // Use only 10-20% of available headroom for subtle pan
  const usableHeadroom = totalHeadroom * 0.15; // 15% of 360px = 54px

  // Leave buffer zones at top and bottom (remaining 85% of headroom)
  const bufferZone = (totalHeadroom - usableHeadroom) / 2; // = (360 - 54) / 2 = 153px

  // Randomly choose pan direction (up or down)
  const direction: PanDirection = Math.random() > 0.5 ? "down" : "up";

  // Calculate start and end Y positions (as percentage of scaled height)
  // We need to express Y as a percentage because zoompan works with normalized coordinates
  let yStartPercent: number;
  let yEndPercent: number;

  if (direction === "down") {
    // Pan down: start at top buffer, end at top buffer + usable headroom
    yStartPercent = bufferZone / scaledHeight;
    yEndPercent = (bufferZone + usableHeadroom) / scaledHeight;
  } else {
    // Pan up: start at top buffer + usable headroom, end at top buffer
    yStartPercent = (bufferZone + usableHeadroom) / scaledHeight;
    yEndPercent = bufferZone / scaledHeight;
  }

  return {
    enabled: true,
    direction,
    yStart: Math.round(yStartPercent * 1000) / 1000, // Round to 3 decimal places
    yEnd: Math.round(yEndPercent * 1000) / 1000,
  };
}

/**
 * Generate video from images and audio using FFmpeg with chunked rendering
 * @param images - Array of downloaded images with timing information
 * @param audioFilePath - Path to the audio file
 * @returns Video generation result with path and duration
 */
export async function generateVideo(
  images: DownloadedImage[],
  audioFilePath: string
): Promise<VideoGenerationResult> {
  logger.step("Video", `Generating video from ${images.length} images`);
  logger.debug("Video", `Audio file: ${audioFilePath}`);

  if (PAN_EFFECT) {
    logger.log("Video", "🎬 Pan effect enabled - applying subtle vertical motion to images");
  } else {
    logger.log("Video", "📷 Pan effect disabled - using static images");
  }

  // Sort images by start time to ensure correct order
  const sortedImages = [...images].sort((a, b) => a.start - b.start);

  // Calculate total duration
  let totalDuration = 0;
  for (const image of sortedImages) {
    totalDuration += (image.end - image.start) / 1000;
  }

  // Generate output filename
  const timestamp = Date.now();
  const outputFilename = `video_${timestamp}.mp4`;
  const outputPath = join(TMP_VIDEO_DIR, outputFilename);

  // Decide whether to use chunked rendering or single-pass rendering
  if (sortedImages.length > IMAGES_PER_CHUNK) {
    logger.step("Video", `Using chunked rendering (${IMAGES_PER_CHUNK} images per chunk) to prevent memory exhaustion`);
    await renderVideoInChunks(sortedImages, audioFilePath, outputPath);
  } else {
    logger.step("Video", `Using single-pass rendering (${sortedImages.length} images)`);
    const { filterComplex } = createFilterComplex(sortedImages);
    await runFFmpeg(sortedImages, audioFilePath, filterComplex, outputPath);
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
 * Create FFmpeg filter complex for image transitions
 * @param images - Sorted array of images with timing
 * @returns Filter complex string and total duration
 */
function createFilterComplex(
  images: DownloadedImage[]
): { filterComplex: string; totalDuration: number } {
  const filters: string[] = [];
  let totalDuration = 0;

  const imagesLength = images.length;

  // Process each image with optional pan effect
  for (let i = 0; i < imagesLength; i++) {
    const image = images[i];
    if (!image) continue;

    const duration = (image.end - image.start) / 1000; // Convert ms to seconds
    totalDuration += duration;

    // Calculate pan parameters for this image
    const panParams = calculatePanParams(duration);

    if (panParams.enabled) {
      // Apply pan effect using zoompan filter
      // CRITICAL FIX: The zoompan filter must output exactly the right number of frames
      // and then stop, otherwise it will continue outputting frames indefinitely

      const fps = 30;
      const totalFrames = Math.round(duration * fps);

      // Zoompan filter parameters:
      // - z=1: No zoom (keep scale at 1x)
      // - x=iw/2-(iw/zoom/2): Center horizontally
      // - y=...: Vertical position (animated from yStart to yEnd)
      // - d=1: Duration per frame (1 frame) - CRITICAL: This makes it output exactly totalFrames frames
      // - s=1920x1080: Output size
      // - fps=30: Frame rate

      // Y expression: interpolate from yStart to yEnd over totalFrames
      // on = output frame number (0 to totalFrames-1)
      // Formula: yStart + (yEnd - yStart) * (on / totalFrames)
      const yExpression = `ih*${panParams.yStart}+(ih*${panParams.yEnd}-ih*${panParams.yStart})*on/${totalFrames}`;

      // CRITICAL: Use trim filter to ensure exactly the right duration
      filters.push(
        `[${i}:v]scale=1920:-1,zoompan=z=1:x=iw/2-(iw/zoom/2):y=${yExpression}:d=1:s=1920x1080:fps=${fps},trim=duration=${duration},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v${i}]`
      );

      logger.debug("Video", `Image ${i + 1}: Pan ${panParams.direction} (${(panParams.yStart * 100).toFixed(1)}% → ${(panParams.yEnd * 100).toFixed(1)}%) over ${duration.toFixed(2)}s (${totalFrames} frames)`);
    } else {
      // No pan effect - use static image with scale and pad
      filters.push(
        `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`
      );
    }
  }

  // Concatenate all video segments
  const concatInputs = Array.from({ length: imagesLength }, (_, i) => `[v${i}]`).join("");
  filters.push(`${concatInputs}concat=n=${imagesLength}:v=1:a=0[outv]`);

  const filterComplex = filters.join(";");

  return { filterComplex, totalDuration };
}

/**
 * Run FFmpeg command to generate video
 * @param images - Array of images
 * @param audioFilePath - Path to audio file
 * @param filterComplex - FFmpeg filter complex string
 * @param outputPath - Output video path
 */
async function runFFmpeg(
  images: DownloadedImage[],
  audioFilePath: string,
  filterComplex: string,
  outputPath: string
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

    // Build complete FFmpeg arguments with memory-efficient settings
    const ffmpegArgs = [
      ...inputArgs,
      "-filter_complex",
      filterComplex,
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
      "-shortest", // End video when shortest stream ends
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
 */
async function renderVideoInChunks(
  images: DownloadedImage[],
  audioFilePath: string,
  outputPath: string
): Promise<void> {
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
    if (!chunk) continue;

    logger.step("Video", `Rendering chunk ${i + 1}/${chunks.length} (${chunk.length} images)...`);

    // Calculate audio segment timing for this chunk
    const chunkStartTime = chunk[0]!.start / 1000; // Convert ms to seconds
    const chunkEndTime = chunk[chunk.length - 1]!.end / 1000;
    const chunkDuration = chunkEndTime - chunkStartTime;

    // Generate chunk output path
    const chunkPath = join(TMP_VIDEO_DIR, `chunk_${timestamp}_${i}.mp4`);
    chunkPaths.push(chunkPath);

    // Create filter complex for this chunk
    const { filterComplex } = createFilterComplex(chunk);

    // Render this chunk with the corresponding audio segment
    await runFFmpegChunk(chunk, audioFilePath, filterComplex, chunkPath, chunkStartTime, chunkDuration);

    logger.success("Video", `Chunk ${i + 1}/${chunks.length} completed`);
  }

  // Concatenate all chunks into final video
  logger.step("Video", `Concatenating ${chunks.length} chunks into final video...`);
  await concatenateChunks(chunkPaths, outputPath);

  // Cleanup chunk files
  logger.debug("Video", `Cleaning up ${chunkPaths.length} temporary chunk files...`);
  for (const chunkPath of chunkPaths) {
    try {
      await unlink(chunkPath);
      logger.debug("Video", `Deleted ${chunkPath}`);
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
 */
async function runFFmpegChunk(
  images: DownloadedImage[],
  audioFilePath: string,
  filterComplex: string,
  outputPath: string,
  audioStartTime: number,
  audioDuration: number
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

    // Build complete FFmpeg arguments with memory-efficient settings
    const ffmpegArgs = [
      ...inputArgs,
      "-filter_complex",
      filterComplex,
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
      "-shortest",
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

