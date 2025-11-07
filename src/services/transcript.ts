/**
 * Transcript processing service for chunking words into segments
 */

import { WORDS_PER_SEGMENT } from "../constants.ts";
import type {
  AssemblyAIWord,
  TranscriptSegment,
  SegmentProcessingResult,
} from "../types.ts";
import * as logger from "../logger.ts";

/**
 * Chunk words into segments and generate formatted transcript
 * @param words - Array of words from AssemblyAI transcription
 * @returns Segments array and formatted transcript string
 */
export function processTranscript(
  words: AssemblyAIWord[]
): SegmentProcessingResult {
  logger.step("Transcript", `Processing ${words.length} words into segments`, `${WORDS_PER_SEGMENT} words per segment`);

  const segments: TranscriptSegment[] = [];
  let currentChunk: string[] = [];
  let lastEnd = 0;

  const wordsLength = words.length;

  for (let i = 0; i < wordsLength; i++) {
    const word = words[i];
    if (!word) continue;

    currentChunk.push(word.text);

    // Create segment when chunk is full or at the last word
    if (currentChunk.length === WORDS_PER_SEGMENT || i === wordsLength - 1) {
      const text = currentChunk.join(" ");
      const start = lastEnd;
      const end = word.end;

      segments.push({
        index: segments.length + 1,
        text,
        start,
        end,
      });

      logger.debug("Transcript", `Segment ${segments.length}: ${currentChunk.length} words, ${start}ms-${end}ms`);

      // Reset for next chunk - create new array
      currentChunk = [];
      lastEnd = end;
    }
  }

  logger.success("Transcript", `Created ${segments.length} segments total`);

  // Generate formatted transcript
  const formattedTranscript = generateFormattedTranscript(segments);

  return {
    segments,
    formattedTranscript,
  };
}

/**
 * Generate formatted transcript string from segments
 * @param segments - Array of transcript segments
 * @returns Formatted transcript string
 */
function generateFormattedTranscript(segments: TranscriptSegment[]): string {
  let formatted = "";
  const segmentsLength = segments.length;

  for (let i = 0; i < segmentsLength; i++) {
    const segment = segments[i];
    if (!segment) continue;

    formatted += `[${segment.start}–${segment.end}ms]: ${segment.text}\n`;
  }

  return formatted;
}

/**
 * Validate transcript data
 * @param words - Array of words to validate
 * @returns True if valid, throws error otherwise
 */
export function validateTranscriptData(words: AssemblyAIWord[]): boolean {
  if (!Array.isArray(words)) {
    throw new Error("Words must be an array");
  }

  if (words.length === 0) {
    throw new Error("Words array is empty");
  }

  // Validate first word structure
  const firstWord = words[0];
  if (!firstWord) {
    throw new Error("First word is undefined");
  }

  if (
    typeof firstWord.text !== "string" ||
    typeof firstWord.start !== "number" ||
    typeof firstWord.end !== "number"
  ) {
    throw new Error("Invalid word structure");
  }

  logger.success("Transcript", `Validation passed for ${words.length} words`);
  return true;
}

