/**
 * Simple script to add disclaimer video to an existing video
 * incase the disclaimer was not included during video generation
 * 
 * Usage:
 *   bun add-disclaimer.ts <input-video-path> [output-video-path]
 * 
 * Examples:
 *   bun add-disclaimer.ts tmp/video/video_1234567890.mp4
 *   bun add-disclaimer.ts tmp/video/video_1234567890.mp4 tmp/video/final_with_disclaimer.mp4
 */

import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";

const DISCLAIMER_VIDEO_PATH = "asset/start.mov";

/**
 * Add disclaimer video to the beginning of an existing video
 * @param inputVideoPath - Path to the existing video
 * @param outputVideoPath - Path for the output video (optional)
 */
async function addDisclaimerToVideo(
  inputVideoPath: string,
  outputVideoPath?: string
): Promise<void> {
  // Validate input video exists
  if (!existsSync(inputVideoPath)) {
    throw new Error(`Input video not found: ${inputVideoPath}`);
  }

  // Validate disclaimer video exists
  if (!existsSync(DISCLAIMER_VIDEO_PATH)) {
    throw new Error(`Disclaimer video not found: ${DISCLAIMER_VIDEO_PATH}`);
  }

  // Generate output path if not provided
  const finalOutputPath = outputVideoPath || (() => {
    const dir = dirname(inputVideoPath);
    const name = basename(inputVideoPath, ".mp4");
    return join(dir, `${name}_with_disclaimer.mp4`);
  })();

  // Convert to absolute paths
  const absoluteDisclaimerPath = resolve(DISCLAIMER_VIDEO_PATH);
  const absoluteInputPath = resolve(inputVideoPath);
  const absoluteOutputPath = resolve(finalOutputPath);

  console.log("🎬 Adding disclaimer to video...");
  console.log(`   Disclaimer: ${absoluteDisclaimerPath}`);
  console.log(`   Input:      ${absoluteInputPath}`);
  console.log(`   Output:     ${absoluteOutputPath}`);
  console.log("");

  // Create concat list file with absolute paths
  const concatListPath = join(dirname(absoluteInputPath), `concat_${Date.now()}.txt`);
  const concatContent = [
    `file '${absoluteDisclaimerPath}'`,
    `file '${absoluteInputPath}'`
  ].join("\n");

  await writeFile(concatListPath, concatContent, "utf-8");
  console.log(`✅ Created concat list: ${concatListPath}`);

  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-c", "copy",
      "-y",
      absoluteOutputPath,
    ];

    console.log(`🎥 Running FFmpeg...`);
    console.log(`   Command: ffmpeg ${ffmpegArgs.join(" ")}`);
    console.log("");

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let stderrOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on("close", async (code) => {
      if (code === 0) {
        console.log("✅ Disclaimer added successfully!");
        console.log(`   Output saved to: ${absoluteOutputPath}`);
        console.log("");

        // Clean up concat list file
        try {
          await unlink(concatListPath);
          console.log(`🧹 Cleaned up concat list file`);
        } catch (error) {
          console.warn(`⚠️  Failed to delete concat list: ${error instanceof Error ? error.message : String(error)}`);
        }

        resolve();
      } else {
        console.error(`❌ FFmpeg failed with exit code ${code}`);
        console.error(`   Concat list kept for debugging: ${concatListPath}`);
        console.error("");
        console.error("FFmpeg output:");
        console.error(stderrOutput);

        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (error) => {
      console.error(`❌ Failed to start FFmpeg: ${error.message}`);
      reject(new Error(`Failed to start FFmpeg: ${error.message}`));
    });
  });
}

// Main execution
const inputVideo = process.argv[2] || "tmp/video/content_1762787548898.mp4";
const outputVideo = process.argv[3];

if (!inputVideo) {
  console.error("❌ Error: No input video specified");
  console.error("");
  console.error("Usage:");
  console.error("  bun add-disclaimer.ts <input-video-path> [output-video-path]");
  console.error("");
  console.error("Examples:");
  console.error("  bun add-disclaimer.ts tmp/video/video_1234567890.mp4");
  console.error("  bun add-disclaimer.ts tmp/video/video_1234567890.mp4 tmp/video/final.mp4");
  console.error("");
  console.error("Default:");
  console.error("  bun add-disclaimer.ts  (uses tmp/video/content_1762787548898.mp4)");
  process.exit(1);
}

addDisclaimerToVideo(inputVideo, outputVideo)
  .then(() => {
    console.log("✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  });

