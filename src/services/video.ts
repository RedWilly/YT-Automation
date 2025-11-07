/**
 * Video generation service using FFmpeg
 */

import { TMP_VIDEO_DIR } from "../constants.ts";
import type { DownloadedImage, VideoGenerationResult } from "../types.ts";
import { join } from "node:path";
import { spawn } from "node:child_process";
import * as logger from "../logger.ts";

/**
 * Generate video from images and audio using FFmpeg
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

  // Sort images by start time to ensure correct order
  const sortedImages = [...images].sort((a, b) => a.start - b.start);

  // Create filter complex for FFmpeg
  const { filterComplex, totalDuration } = createFilterComplex(sortedImages);

  // Generate output filename
  const timestamp = Date.now();
  const outputFilename = `video_${timestamp}.mp4`;
  const outputPath = join(TMP_VIDEO_DIR, outputFilename);

  // Build FFmpeg command
  await runFFmpeg(sortedImages, audioFilePath, filterComplex, outputPath);

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

  // Scale and pad each image to 1920x1080
  for (let i = 0; i < imagesLength; i++) {
    const image = images[i];
    if (!image) continue;

    const duration = (image.end - image.start) / 1000; // Convert ms to seconds
    totalDuration += duration;

    // Scale image to fit 1920x1080 while maintaining aspect ratio, then pad
    filters.push(
      `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`
    );
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

    // Build complete FFmpeg arguments
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
      "medium",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest", // End video when shortest stream ends
      "-y", // Overwrite output file
      outputPath,
    ];

    logger.step("Video", `Running FFmpeg with ${images.length} images`);
    logger.debug("Video", `FFmpeg command: ffmpeg ${ffmpegArgs.join(" ")}`);

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
        logger.error("Video", `FFmpeg exited with code ${code}`);
        logger.debug("Video", `FFmpeg stderr output:\n${stderrOutput}`);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`Failed to start FFmpeg: ${error.message}`));
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

