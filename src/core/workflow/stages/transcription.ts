/**
 * Stage 1-2: Transcription
 * Transcribes audio using AssemblyAI (or uses cached result)
 */

import type { WorkflowState } from "./types.ts";
import { transcribeAudio, validateTranscriptData } from "../../../services/transcription/index.ts";
import { getCachedTranscript, setAudioCache } from "../../../services/storage/index.ts";
import * as logger from "../../../utils/logger.ts";

export async function transcriptionStage(state: WorkflowState): Promise<WorkflowState> {
    if (!state.audioHash) {
        throw new Error("transcriptionStage requires audioHash from cache-init stage");
    }

    const cachedTranscript = getCachedTranscript(state.audioHash);

    if (cachedTranscript) {
        logger.log("Workflow", "📦 Using cached transcript (skipping AssemblyAI API call)");

        validateTranscriptData(cachedTranscript.words);

        return {
            ...state,
            transcriptWords: cachedTranscript.words,
            audioDuration: cachedTranscript.audioDuration,
        };
    }

    await state.progress.update({
        step: "Transcription",
        message: "Transcribing audio with AssemblyAI...\nThis may take a few minutes.",
    });

    const transcript = await transcribeAudio(state.audioFilePath);

    setAudioCache(state.audioHash, {
        transcript_id: transcript.id,
        transcript_words: JSON.stringify(transcript.words),
        audio_duration: transcript.audio_duration ?? undefined,
    });

    validateTranscriptData(transcript.words);
    logger.step("Workflow", "Transcription completed and cached");

    return {
        ...state,
        transcriptWords: transcript.words,
        audioDuration: transcript.audio_duration,
    };
}
