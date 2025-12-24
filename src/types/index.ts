/**
 * Type definitions for the YouTube automation workflow
 */

// AssemblyAI Types
export interface AssemblyAIUploadResponse {
  upload_url: string;
}

export interface AssemblyAIWord {
  confidence: number;
  start: number;
  end: number;
  text: string;
  speaker: string | null;
}

export interface AssemblyAITranscriptResponse {
  id: string;
  audio_url: string;
  status: "queued" | "processing" | "completed" | "error";
  text: string;
  words: AssemblyAIWord[];
  audio_duration: number | null; // Duration of audio file in seconds
  error?: string;
}

export interface AssemblyAITranscriptRequest {
  audio_url: string;
}

// Transcript Processing Types
export interface TranscriptSegment {
  index: number;
  text: string;
  start: number;
  end: number;
}

export interface SegmentProcessingResult {
  segments: TranscriptSegment[];
  formattedTranscript: string;
}

// LLM Types

/**
 * Shot type for natural editing - controls per-shot video effects
 * - pan: vertical pan up/down (random direction), uses 4:3 aspect ratio for headroom
 * - zoom: subtle zoom in/out (random direction), uses 16:9 aspect ratio
 * - static: no movement, uses 16:9 aspect ratio
 */
export type ShotType = "pan" | "zoom" | "static";

export interface ImageSearchQuery {
  start: number;
  end: number;
  query: string;
  /** Shot type for natural editing effects */
  type?: ShotType;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Image Download Types
export interface DownloadedImage {
  query: string;
  start: number;
  end: number;
  filePath: string;
  /** Shot type for natural editing effects (when naturalEdit is enabled) */
  type?: ShotType;
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

