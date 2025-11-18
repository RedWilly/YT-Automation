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

// DeepSeek LLM Types
export interface ImageSearchQuery {
  start: number;
  end: number;
  query: string;
}

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface DeepSeekResponse {
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
export type PanDirection = "up" | "down";

export interface PanParams {
  enabled: boolean;
  direction: PanDirection;
  yStart: number; // Starting Y position (pixels)
  yEnd: number; // Ending Y position (pixels)
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

