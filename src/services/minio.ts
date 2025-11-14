/**
 * MinIO object storage service for uploading finished videos
 * Uses Bun's built-in S3Client for S3-compatible storage
 */

import { S3Client } from "bun";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import * as logger from "../logger.ts";
import {
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_REGION,
} from "../constants.ts";

/**
 * Upload result interface
 */
export interface MinIOUploadResult {
  success: boolean;
  objectKey: string;
  url: string;
  bucket: string;
  size: number;
  error?: string;
}

/**
 * Create S3Client instance with MinIO credentials
 * @returns Configured S3Client instance
 */
function createS3Client(): S3Client {
  return new S3Client({
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
    bucket: MINIO_BUCKET,
    endpoint: MINIO_ENDPOINT,
    region: MINIO_REGION,
  });
}

/**
 * Ensure the MinIO bucket exists, create if it doesn't
 * @returns True if bucket exists or was created successfully
 */
export async function ensureBucketExists(): Promise<boolean> {
  try {
    logger.debug("MinIO", `Checking if bucket '${MINIO_BUCKET}' exists...`);
    
    const s3 = createS3Client();
    
    // Try to stat a non-existent file to check if bucket exists
    // If bucket doesn't exist, this will throw an error
    try {
      await s3.stat(".bucket-check");
    } catch (error: any) {
      // If error is "NoSuchBucket", we need to create it
      // If error is "NoSuchKey", bucket exists but file doesn't (expected)
      if (error?.message?.includes("NoSuchBucket") || error?.code === "NoSuchBucket") {
        logger.warn("MinIO", `Bucket '${MINIO_BUCKET}' does not exist. Note: Bun's S3Client cannot create buckets automatically.`);
        logger.warn("MinIO", `Please create the bucket '${MINIO_BUCKET}' manually in MinIO console.`);
        return false;
      }
    }
    
    logger.success("MinIO", `Bucket '${MINIO_BUCKET}' exists`);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("MinIO", `Failed to check bucket existence: ${errorMsg}`);
    return false;
  }
}

/**
 * Upload a video file to MinIO
 * @param videoFilePath - Local path to the video file
 * @returns Upload result with object URL and metadata
 */
export async function uploadVideoToMinIO(
  videoFilePath: string
): Promise<MinIOUploadResult> {
  try {
    logger.step("MinIO", `Uploading video to MinIO: ${videoFilePath}`);

    // Ensure bucket exists
    const bucketExists = await ensureBucketExists();
    if (!bucketExists) {
      throw new Error(`Bucket '${MINIO_BUCKET}' does not exist. Please create it in MinIO console.`);
    }

    // Read the video file
    const fileBuffer = await readFile(videoFilePath);
    const fileSize = fileBuffer.byteLength;
    const fileName = basename(videoFilePath);
    const objectKey = `videos/${fileName}`;

    logger.debug("MinIO", `File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    logger.debug("MinIO", `Object key: ${objectKey}`);

    // Create S3 client
    const s3 = createS3Client();

    // Upload the file using Bun's S3Client.write()
    await s3.write(objectKey, fileBuffer, {
      type: "video/mp4",
    });

    // Construct the object URL
    const objectUrl = `${MINIO_ENDPOINT}/${MINIO_BUCKET}/${objectKey}`;

    logger.success("MinIO", `Video uploaded successfully!`);
    logger.log("MinIO", `Object URL: ${objectUrl}`);
    logger.log("MinIO", `Object key: ${objectKey}`);
    logger.log("MinIO", `Bucket: ${MINIO_BUCKET}`);

    return {
      success: true,
      objectKey,
      url: objectUrl,
      bucket: MINIO_BUCKET,
      size: fileSize,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("MinIO", `Failed to upload video: ${errorMsg}`);

    return {
      success: false,
      objectKey: "",
      url: "",
      bucket: MINIO_BUCKET,
      size: 0,
      error: errorMsg,
    };
  }
}

