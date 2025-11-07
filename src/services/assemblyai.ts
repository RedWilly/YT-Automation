/**
 * AssemblyAI service for audio transcription
 */

import {
  ASSEMBLYAI_API_KEY,
  ASSEMBLYAI_UPLOAD_URL,
  ASSEMBLYAI_TRANSCRIPT_URL,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
} from "../constants.ts";
import type {
  AssemblyAIUploadResponse,
  AssemblyAITranscriptRequest,
  AssemblyAITranscriptResponse,
} from "../types.ts";
import * as logger from "../logger.ts";

/**
 * Upload audio file to AssemblyAI
 * @param audioFilePath - Path to the audio file
 * @returns Upload URL for the audio file
 */
export async function uploadAudio(audioFilePath: string): Promise<string> {
  logger.step("AssemblyAI", "Uploading audio file", audioFilePath);

  const file = Bun.file(audioFilePath);
  const audioData = await file.arrayBuffer();

  const response = await fetch(ASSEMBLYAI_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
      "Content-Type": "application/octet-stream",
    },
    body: audioData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to upload audio to AssemblyAI: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as AssemblyAIUploadResponse;
  logger.success("AssemblyAI", "Audio uploaded successfully");
  logger.debug("AssemblyAI", `Upload URL: ${data.upload_url}`);

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

  const response = await fetch(ASSEMBLYAI_TRANSCRIPT_URL, {
    method: "POST",
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to request transcription: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as AssemblyAITranscriptResponse;
  logger.success("AssemblyAI", `Transcription requested (ID: ${data.id})`);
  logger.debug("AssemblyAI", `Status: ${data.status}`);

  return data;
}

/**
 * Get transcription status and result
 * @param transcriptId - ID of the transcript
 * @returns Transcript response with current status
 */
export async function getTranscript(
  transcriptId: string
): Promise<AssemblyAITranscriptResponse> {
  const url = `${ASSEMBLYAI_TRANSCRIPT_URL}/${transcriptId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get transcript: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as AssemblyAITranscriptResponse;
  return data;
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

    // Wait before next poll
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

