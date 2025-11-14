/**
 * Video generation service using FFmpeg
 */

import { TMP_VIDEO_DIR, IMAGES_PER_CHUNK, PAN_EFFECT, CAPTIONS_ENABLED } from "../constants.ts";
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

  // Use 30% of available headroom for visible pan effect
  // NOTE: Increased from 15% to 30% to make pan more visible
  const usableHeadroom = totalHeadroom * 0.30; // 30% of 360px = 108px

  // Leave buffer zones at top and bottom (remaining 70% of headroom)
  const bufferZone = (totalHeadroom - usableHeadroom) / 2; // = (360 - 108) / 2 = 126px

  // Randomly choose pan direction (up or down)
  const direction: PanDirection = Math.random() > 0.5 ? "down" : "up";

  // Calculate start and end Y positions in pixels
  let yStart: number;
  let yEnd: number;

  if (direction === "down") {
    // Pan down: start at top buffer, end at top buffer + usable headroom
    yStart = bufferZone;
    yEnd = bufferZone + usableHeadroom;
  } else {
    // Pan up: start at top buffer + usable headroom, end at top buffer
    yStart = bufferZone + usableHeadroom;
    yEnd = bufferZone;
  }

  return {
    enabled: true,
    direction,
    yStart: Math.round(yStart),
    yEnd: Math.round(yEnd),
  };
}

/**
 * Generate video from images and audio using FFmpeg with chunked rendering
 * @param images - Array of downloaded images with timing information
 * @param audioFilePath - Path to the audio file
 * @param assFilePath - Optional path to ASS subtitle file for captions
 * @returns Video generation result with path and duration
 */
export async function generateVideo(
  images: DownloadedImage[],
  audioFilePath: string,
  assFilePath?: string
): Promise<VideoGenerationResult> {
  logger.step("Video", `Generating video from ${images.length} images`);
  logger.debug("Video", `Audio file: ${audioFilePath}`);

  if (PAN_EFFECT) {
    logger.log("Video", "🎬 Pan effect enabled - applying subtle vertical motion to images");
  } else {
    logger.log("Video", "📷 Pan effect disabled - using static images");
  }

  if (CAPTIONS_ENABLED && assFilePath) {
    logger.log("Video", "📝 Captions enabled - adding word-by-word highlighted subtitles");
    logger.debug("Video", `ASS file: ${assFilePath}`);
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
  const timestamp = Date.now();
  const outputFilename = `video_${timestamp}.mp4`;
  const outputPath = join(TMP_VIDEO_DIR, outputFilename);

  // Decide whether to use chunked rendering or single-pass rendering
  if (sortedImages.length > IMAGES_PER_CHUNK) {
    logger.step("Video", `Using chunked rendering (${IMAGES_PER_CHUNK} images per chunk) to prevent memory exhaustion`);
    await renderVideoInChunks(sortedImages, audioFilePath, outputPath, assFilePath);
  } else {
    logger.step("Video", `Using single-pass rendering (${sortedImages.length} images)`);
    const { filterComplex } = createFilterComplex(sortedImages);
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
      // Apply pan effect using scale + crop (NO ZOOMPAN!)
      //
      // Why not zoompan?
      // - zoompan is designed for zoom effects, not simple panning
      // - It has complex frame timing issues with -loop 1
      // - For vertical pan only, we just need: scale → crop with animated Y position
      //
      // Filter chain:
      // 1. scale=1920:-1 → Scale to 1920px width, maintain aspect ratio (creates 1920×1440 for 4:3 images)
      // 2. fps=30 → Set frame rate to 30fps BEFORE crop (ensures proper frame generation)
      // 3. crop → Crop to 1920×1080 with animated Y position (this creates the pan effect)
      // 4. setsar=1 → Set sample aspect ratio to 1:1
      // 5. format=yuv420p → Convert to YUV420P color format

      const fps = 30;
      const totalFrames = Math.round(duration * fps);

      // Animated Y position for crop filter
      //
      // The crop filter's y parameter can use expressions with 'n' (frame number)
      // Formula: yStart + (yEnd - yStart) * (n / totalFrames)
      //
      // 'n' starts at 0 and increments by 1 for each frame
      // We clamp it to totalFrames to prevent overshooting
      const yExpression = `if(lte(n,${totalFrames}),${panParams.yStart}+(${panParams.yEnd}-${panParams.yStart})*n/${totalFrames},${panParams.yEnd})`;

      // Crop filter parameters:
      // - w=1920: Output width (crop to 1920px)
      // - h=1080: Output height (crop to 1080px)
      // - x=0: Horizontal position (no horizontal pan, start at left edge)
      // - y=...: Vertical position (animated from yStart to yEnd)
      //
      // This crops a 1920×1080 window from the 1920×1440 scaled image,
      // with the Y position animating from yStart to yEnd over totalFrames frames
      filters.push(
        `[${i}:v]scale=1920:-1,fps=${fps},crop=w=1920:h=1080:x=0:y='${yExpression}',setsar=1,format=yuv420p[v${i}]`
      );

      logger.debug("Video", `Image ${i + 1}: Pan ${panParams.direction} (${panParams.yStart}px → ${panParams.yEnd}px) over ${duration.toFixed(2)}s (${totalFrames} frames)`);
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
    let finalFilterComplex = filterComplex;
    if (CAPTIONS_ENABLED && assFilePath) {
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
 * @param assFilePath - Optional path to ASS subtitle file
 */
async function renderVideoInChunks(
  images: DownloadedImage[],
  audioFilePath: string,
  outputPath: string,
  assFilePath?: string
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

    // Render this chunk with the corresponding audio segment (no subtitles yet)
    await runFFmpegChunk(chunk, audioFilePath, filterComplex, chunkPath, chunkStartTime, chunkDuration);

    logger.success("Video", `Chunk ${i + 1}/${chunks.length} completed`);
  }

  // Concatenate all chunks into final video
  logger.step("Video", `Concatenating ${chunks.length} chunks into final video...`);

  // If captions are enabled, concatenate to a temp file first, then add subtitles
  const tempOutputPath = CAPTIONS_ENABLED && assFilePath
    ? join(TMP_VIDEO_DIR, `temp_no_subs_${timestamp}.mp4`)
    : outputPath;

  await concatenateChunks(chunkPaths, tempOutputPath);

  // Add subtitles to the concatenated video if enabled
  if (CAPTIONS_ENABLED && assFilePath) {
    logger.step("Video", "Adding subtitles to concatenated video...");
    await addSubtitlesToVideo(tempOutputPath, assFilePath, outputPath);

    // Delete temp file without subtitles
    try {
      await unlink(tempOutputPath);
      logger.debug("Video", `Deleted temp file: ${tempOutputPath}`);
    } catch (error) {
      logger.warn("Video", `Failed to delete temp file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
 * Add subtitles to an existing video file
 * @param inputVideoPath - Path to input video file
 * @param assFilePath - Path to ASS subtitle file
 * @param outputVideoPath - Path to output video file with subtitles
 */
async function addSubtitlesToVideo(
  inputVideoPath: string,
  assFilePath: string,
  outputVideoPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Escape the ASS file path for Windows (replace backslashes with forward slashes and escape colons)
    const escapedAssPath = assFilePath.replace(/\\/g, "/").replace(/:/g, "\\:");

    const ffmpegArgs = [
      "-i",
      inputVideoPath,
      "-vf",
      // NOTE: Do NOT use force_style parameter - it overrides inline styling tags in the ASS file
      // The ASS file already contains all the styling information for word-by-word highlighting
      `subtitles='${escapedAssPath}'`,
      "-c:a",
      "copy", // Copy audio without re-encoding
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-y",
      outputVideoPath,
    ];

    logger.debug("Video", `Adding subtitles: ffmpeg ${ffmpegArgs.join(" ")}`);

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let stderrOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      const output = data.toString();
      stderrOutput += output;
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        logger.success("Video", "Subtitles added successfully");
        resolve();
      } else {
        logger.error("Video", `Failed to add subtitles (exit code ${code})`);
        logger.debug("Video", `FFmpeg stderr:\n${stderrOutput}`);
        reject(new Error(`FFmpeg subtitle overlay exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (error) => {
      logger.error("Video", `Failed to start FFmpeg for subtitles: ${error.message}`);
      reject(new Error(`Failed to start FFmpeg for subtitles: ${error.message}`));
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

