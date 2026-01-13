import { AssemblyAI } from "assemblyai";
import { TRANSCRIPTION } from "../../config/index.ts";
import type {
  AssemblyAIUploadResponse,
  AssemblyAITranscriptRequest,
  AssemblyAITranscriptResponse,
} from "../../types/index.ts";
import * as logger from "../../utils/logger.ts";

// Initialize AssemblyAI client
const client = new AssemblyAI({
  apiKey: TRANSCRIPTION.assemblyAiKey,
});

// Get poll settings from environment
const ASSEMBLYAI_POLL_INTERVAL_MS = TRANSCRIPTION.pollIntervalMs;
const ASSEMBLYAI_MAX_POLLS = TRANSCRIPTION.maxPolls;

export async function uploadAudio(audioFilePath: string): Promise<string> {
  logger.step("AssemblyAI", "Uploading audio file", audioFilePath);
  const uploadUrl = await client.files.upload(audioFilePath);
  logger.success("AssemblyAI", "Audio uploaded successfully");
  logger.debug("AssemblyAI", `Upload URL: ${uploadUrl}`);
  return uploadUrl;
}

export async function requestTranscription(
  audioUrl: string
): Promise<AssemblyAITranscriptResponse> {
  logger.step("AssemblyAI", "Requesting transcription");
  logger.debug("AssemblyAI", `Audio URL: ${audioUrl}`);

  const requestBody: AssemblyAITranscriptRequest = {
    audio_url: audioUrl,
  };

  const transcript = await client.transcripts.create(requestBody);
  logger.success("AssemblyAI", `Transcription requested (ID: ${transcript.id})`);
  logger.debug("AssemblyAI", `Status: ${transcript.status}`);

  return transcript as AssemblyAITranscriptResponse;
}

export async function getTranscript(
  transcriptId: string
): Promise<AssemblyAITranscriptResponse> {
  const transcript = await client.transcripts.get(transcriptId);
  return transcript as AssemblyAITranscriptResponse;
}

export async function pollForCompletion(
  transcriptId: string
): Promise<AssemblyAITranscriptResponse> {
  logger.step("AssemblyAI", "Polling for transcription completion");
  logger.debug("AssemblyAI", `Transcript ID: ${transcriptId}`);

  let attempts = 0;

  while (attempts < ASSEMBLYAI_MAX_POLLS) {
    const transcript = await getTranscript(transcriptId);

    logger.debug(
      "AssemblyAI",
      `Poll attempt ${attempts + 1}/${ASSEMBLYAI_MAX_POLLS} - Status: ${transcript.status}`
    );

    if (transcript.status === "completed") {
      logger.success("AssemblyAI", "Transcription completed successfully");
      return transcript;
    }

    if (transcript.status === "error") {
      throw new Error(
        `Transcription failed: ${transcript.error || "Unknown error"}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, ASSEMBLYAI_POLL_INTERVAL_MS));
    attempts++;
  }

  throw new Error(
    `Transcription polling timed out after ${ASSEMBLYAI_MAX_POLLS} attempts`
  );
}

export async function transcribeAudio(
  audioFilePath: string
): Promise<AssemblyAITranscriptResponse> {
  // Step 1: Upload audio
  const uploadUrl = await uploadAudio(audioFilePath);

  // Step 2: Request transcription
  const transcriptResponse = await requestTranscription(uploadUrl);

  // Step 3: Check if already completed or poll for completion
  if (transcriptResponse.status === "completed") {
    logger.success("AssemblyAI", "Transcription already completed");
    return transcriptResponse;
  }

  // Step 4: Poll for completion
  const completedTranscript = await pollForCompletion(transcriptResponse.id);
  return completedTranscript;
}
