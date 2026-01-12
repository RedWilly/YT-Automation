/**
 * Workflow and progress tracking type definitions
 */

import type { MinIOUploadResult } from "./video.ts";

// Workflow Types
export interface WorkflowResult {
  videoPath: string;
  duration: number;
  minioUpload?: MinIOUploadResult;
}

// Progress Tracking Types
export interface ProgressUpdate {
  step: string;
  message: string;
  percentage?: number;
  current?: number;
  total?: number;
}
