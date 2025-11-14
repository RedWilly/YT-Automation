/**
 * Transcript processing service for intelligent sentence-based segmentation
 */

import { segmentBySentences, getSentenceTimestamps } from "./segmentation.ts";
import type {
  AssemblyAIWord,
  TranscriptSegment,
  SegmentProcessingResult,
} from "../types.ts";
import * as logger from "../logger.ts";

/**
 * Process transcript words into intelligent sentence-based segments
 * Uses smart sentence detection with abbreviation handling and short sentence merging
 *
 * @param words - Array of words from AssemblyAI transcription
 * @returns Segments array and formatted transcript string
 */
export function processTranscript(
  words: AssemblyAIWord[]
): SegmentProcessingResult {
  logger.step("Transcript", `Processing ${words.length} words into sentence-based segments`);

  // Use sentence-based segmentation
  const sentenceDetections = segmentBySentences(words);

  // Convert sentence detections to transcript segments with timing
  const segments: TranscriptSegment[] = sentenceDetections.map((sentence, index) => {
    const { start, end } = getSentenceTimestamps(
      words,
      sentence.startWordIndex,
      sentence.endWordIndex
    );

    logger.debug(
      "Transcript",
      `Segment ${index + 1}: "${sentence.text.substring(0, 50)}..." (${sentence.wordCount} words, ${start}ms-${end}ms)`
    );

    return {
      index: index + 1,
      text: sentence.text,
      start,
      end,
    };
  });

  logger.success("Transcript", `Created ${segments.length} sentence-based segments`);

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

