/**
 * AssemblyAI service for audio transcription (using official SDK)
 */

import { AssemblyAI } from "assemblyai";
import {
  ASSEMBLYAI_API_KEY,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
} from "../constants.ts";
import type {
  AssemblyAIUploadResponse,
  AssemblyAITranscriptRequest,
  AssemblyAITranscriptResponse,
} from "../types.ts";
import * as logger from "../logger.ts";

// Initialize AssemblyAI client
const client = new AssemblyAI({
  apiKey: ASSEMBLYAI_API_KEY,
});

/**
 * Upload audio file to AssemblyAI
 * @param audioFilePath - Path to the audio file
 * @returns Upload URL for the audio file
 */
export async function uploadAudio(audioFilePath: string): Promise<string> {
  logger.step("AssemblyAI", "Uploading audio file", audioFilePath);

  const uploadUrl = await client.files.upload(audioFilePath);
  logger.success("AssemblyAI", "Audio uploaded successfully");
  logger.debug("AssemblyAI", `Upload URL: ${uploadUrl}`);

  // Match the original type signature
  const data: AssemblyAIUploadResponse = { upload_url: uploadUrl };
  return data.upload_url;
}

/**
 * Request transcription from AssemblyAI
 * @param audioUrl - URL of the uploaded audio file
 * @returns Transcript response with ID and initial status
 */
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

/**
 * Get transcription status and result
 * @param transcriptId - ID of the transcript
 * @returns Transcript response with current status
 */
export async function getTranscript(
  transcriptId: string
): Promise<AssemblyAITranscriptResponse> {
  const transcript = await client.transcripts.get(transcriptId);
  return transcript as AssemblyAITranscriptResponse;
}

/**
 * Poll for transcription completion
 * @param transcriptId - ID of the transcript to poll
 * @returns Completed transcript response
 */
export async function pollForCompletion(
  transcriptId: string
): Promise<AssemblyAITranscriptResponse> {
  logger.step("AssemblyAI", "Polling for transcription completion");
  logger.debug("AssemblyAI", `Transcript ID: ${transcriptId}`);

  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    const transcript = await getTranscript(transcriptId);

    logger.debug(
      "AssemblyAI",
      `Poll attempt ${attempts + 1}/${MAX_POLL_ATTEMPTS} - Status: ${transcript.status}`
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

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    attempts++;
  }

  throw new Error(
    `Transcription polling timed out after ${MAX_POLL_ATTEMPTS} attempts`
  );
}

/**
 * Complete workflow: upload audio and get transcription
 * @param audioFilePath - Path to the audio file
 * @returns Completed transcript response
 */
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
