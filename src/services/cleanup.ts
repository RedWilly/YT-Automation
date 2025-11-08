/**
 * Cleanup service for temporary files
 * Handles deletion of temporary files after successful workflow completion
 */

import { readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import * as logger from "../logger.ts";
import { TMP_AUDIO_DIR, TMP_IMAGES_DIR, TMP_VIDEO_DIR } from "../constants.ts";
import type { CleanupResult } from "../types.ts";

/**
 * Clean up all temporary files after successful workflow completion
 * @param keepFinalVideo - Whether to keep the final video file (default: false)
 * @param finalVideoPath - Path to the final video file to keep (if keepFinalVideo is true)
 * @returns Cleanup result with deleted files and total size freed
 */
export async function cleanupTempFiles(
  keepFinalVideo: boolean = false,
  finalVideoPath?: string
): Promise<CleanupResult> {
  logger.step("Cleanup", "Starting cleanup of temporary files...");

  const deletedFiles: string[] = [];
  const failedFiles: string[] = [];
  let totalSize = 0;

  // Clean up audio files
  const audioResult = await cleanupDirectory(TMP_AUDIO_DIR, "audio");
  deletedFiles.push(...audioResult.deleted);
  failedFiles.push(...audioResult.failed);
  totalSize += audioResult.size;

  // Clean up image files
  const imagesResult = await cleanupDirectory(TMP_IMAGES_DIR, "images");
  deletedFiles.push(...imagesResult.deleted);
  failedFiles.push(...imagesResult.failed);
  totalSize += imagesResult.size;

  // Clean up video files (chunks, concat lists, and optionally final video)
  const videoResult = await cleanupDirectory(
    TMP_VIDEO_DIR,
    "video",
    keepFinalVideo ? finalVideoPath : undefined
  );
  deletedFiles.push(...videoResult.deleted);
  failedFiles.push(...videoResult.failed);
  totalSize += videoResult.size;

  // Log summary
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
  logger.success("Cleanup", `Deleted ${deletedFiles.length} files (${totalSizeMB} MB freed)`);

  if (failedFiles.length > 0) {
    logger.warn("Cleanup", `Failed to delete ${failedFiles.length} files`);
    failedFiles.forEach((file) => logger.debug("Cleanup", `Failed: ${file}`));
  }

  return {
    deletedFiles,
    failedFiles,
    totalSize,
  };
}

/**
 * Clean up files in a specific directory
 * @param dirPath - Directory path to clean
 * @param label - Label for logging
 * @param excludePath - Optional path to exclude from deletion
 * @returns Cleanup result for this directory
 */
async function cleanupDirectory(
  dirPath: string,
  label: string,
  excludePath?: string
): Promise<{ deleted: string[]; failed: string[]; size: number }> {
  const deleted: string[] = [];
  const failed: string[] = [];
  let size = 0;

  try {
    logger.debug("Cleanup", `Cleaning ${label} directory: ${dirPath}`);

    const files = await readdir(dirPath);

    if (files.length === 0) {
      logger.debug("Cleanup", `No files to clean in ${label} directory`);
      return { deleted, failed, size };
    }

    logger.debug("Cleanup", `Found ${files.length} files in ${label} directory`);

    for (const file of files) {
      const filePath = join(dirPath, file);

      // Skip if this is the file to exclude
      if (excludePath && filePath === excludePath) {
        logger.debug("Cleanup", `Skipping excluded file: ${file}`);
        continue;
      }

      try {
        // Get file size before deletion
        const fileStats = await stat(filePath);
        const fileSize = fileStats.size;

        // Delete the file
        await unlink(filePath);

        deleted.push(filePath);
        size += fileSize;

        logger.debug("Cleanup", `Deleted ${label} file: ${file} (${(fileSize / 1024).toFixed(2)} KB)`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn("Cleanup", `Failed to delete ${file}: ${errorMsg}`);
        failed.push(filePath);
      }
    }

    const deletedSizeMB = (size / 1024 / 1024).toFixed(2);
    logger.success("Cleanup", `Cleaned ${label} directory: ${deleted.length} files (${deletedSizeMB} MB)`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Cleanup", `Failed to read ${label} directory: ${errorMsg}`);
  }

  return { deleted, failed, size };
}

/**
 * Clean up only video temporary files (chunks and concat lists)
 * Keeps the final video file
 * @param finalVideoPath - Path to the final video file to keep
 * @returns Cleanup result
 */
export async function cleanupVideoTempFiles(
  finalVideoPath: string
): Promise<CleanupResult> {
  logger.step("Cleanup", "Cleaning up video temporary files...");

  const deletedFiles: string[] = [];
  const failedFiles: string[] = [];
  let totalSize = 0;

  try {
    const files = await readdir(TMP_VIDEO_DIR);

    for (const file of files) {
      const filePath = join(TMP_VIDEO_DIR, file);

      // Skip the final video file
      if (filePath === finalVideoPath) {
        continue;
      }

      // Delete chunk files and concat list files
      if (file.startsWith("chunk_") || file.startsWith("concat_list_")) {
        try {
          const fileStats = await stat(filePath);
          await unlink(filePath);

          deletedFiles.push(filePath);
          totalSize += fileStats.size;

          logger.debug("Cleanup", `Deleted temp file: ${file}`);
        } catch (error) {
          failedFiles.push(filePath);
        }
      }
    }

    logger.success("Cleanup", `Cleaned up ${deletedFiles.length} temporary video files`);
  } catch (error) {
    logger.error("Cleanup", `Failed to clean video temp files: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { deletedFiles, failedFiles, totalSize };
}

