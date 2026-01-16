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
