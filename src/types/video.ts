/**
 * Video, image, and FFmpeg type definitions
 */

import type { ShotType } from "./llm.ts";

// Image Download Types
export interface DownloadedImage {
  query: string;
  start: number;
  end: number;
  filePath: string;
  /** Shot type for natural editing effects (when naturalEdit is enabled) */
  type?: ShotType;
  /** Seed for image generation (inherited from linked segments) */
  seed?: number;
}

// Video Generation Types
export interface VideoSegment {
  imagePath: string;
  duration: number; // in seconds
}

export interface VideoGenerationResult {
  videoPath: string;
  duration: number;
  minioUpload?: MinIOUploadResult;
}

// MinIO Types
export interface MinIOUploadResult {
  success: boolean;
  objectKey: string;
  url: string;
  bucket: string;
  size: number;
  error?: string;
}

// Cleanup Types
export interface CleanupResult {
  deletedFiles: string[];
  failedFiles: string[];
  totalSize: number; // in bytes
}

// FFmpeg Types
export type PanDirection = "up" | "down" | "left" | "right";

export interface PanParams {
  enabled: boolean;
  direction: PanDirection;
  yStart: number; // Starting Y position (pixels) - for vertical pan
  yEnd: number; // Ending Y position (pixels) - for vertical pan
  xStart: number; // Starting X position (pixels) - for horizontal pan
  xEnd: number; // Ending X position (pixels) - for horizontal pan
}
