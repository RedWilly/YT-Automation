/**
 * Transcript processing service for intelligent segmentation
 * Supports sentence-based and word-count based segmentation
 */

import { segmentBySentences, segmentByWordCount, getSentenceTimestamps } from "./segmentation.ts";
import type {
  AssemblyAIWord,
  TranscriptSegment,
  SegmentProcessingResult,
} from "../types.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import * as logger from "../logger.ts";

/**
 * Process transcript words into segments based on style configuration
 * Supports both sentence-based and word-count based segmentation
 *
 * @param words - Array of words from AssemblyAI transcription
 * @param audioDurationSeconds - Audio duration in seconds from AssemblyAI
 * @param style - Resolved style configuration
 * @returns Segments array and formatted transcript string
 */
export function processTranscript(
  words: AssemblyAIWord[],
  audioDurationSeconds: number | null,
  style: ResolvedStyle
): SegmentProcessingResult {
  const segmentationType = style.segmentationType;
  const segmentationDesc = segmentationType === "wordCount"
    ? `word-count based (${style.wordsPerSegment} words)`
    : "sentence-based";
  logger.step("Transcript", `Processing ${words.length} words into ${segmentationDesc} segments`);

  // CRITICAL FIX: Normalize timestamps so first segment starts at 0ms
  //
  // Problem: AssemblyAI may return timestamps that don't start at 0ms
  // This causes all segments to be offset, breaking image-audio alignment
  const firstWord = words[0];

  if (!firstWord) {
    throw new Error("No words in transcript");
  }

  const timeOffset = firstWord.start;

  // Use AssemblyAI's audio_duration (in seconds) as the actual audio duration
  // This is more accurate than using the last word's end time
  const actualAudioDurationMs = audioDurationSeconds
    ? audioDurationSeconds * 1000
    : words[words.length - 1]?.end || 0;

  if (timeOffset > 0) {
    logger.debug("Transcript", `Normalizing timestamps (offset: ${timeOffset}ms → 0ms)`);
  }

  logger.debug("Transcript", `Actual audio duration: ${actualAudioDurationMs}ms (${(actualAudioDurationMs / 1000).toFixed(2)}s)`);

  // Use appropriate segmentation based on style
  const sentenceDetections = segmentationType === "wordCount"
    ? segmentByWordCount(words, style.wordsPerSegment)
    : segmentBySentences(words);

  // Convert sentence detections to transcript segments with timing
  const segments: TranscriptSegment[] = [];
  let previousEnd = 0;

  for (let index = 0; index < sentenceDetections.length; index++) {
    const sentence = sentenceDetections[index];
    if (!sentence) continue;

    const { end } = getSentenceTimestamps(
      words,
      sentence.startWordIndex,
      sentence.endWordIndex
    );

    const normalizedEnd = end - timeOffset;
    const adjustedStart = index === 0 ? 0 : previousEnd;

    // CRITICAL FIX: For the last segment, extend to actual audio duration
    // This prevents audio cutoff by ensuring the video duration matches the audio file
    // The last segment should play until the audio ends, not just until the last word ends
    const isLastSegment = index === sentenceDetections.length - 1;
    const adjustedEnd = isLastSegment ? (actualAudioDurationMs - timeOffset) : normalizedEnd;

    logger.debug(
      "Transcript",
      `Segment ${index + 1}: "${sentence.text.substring(0, 50)}..." (${sentence.wordCount} words, ${adjustedStart}ms-${adjustedEnd}ms)${isLastSegment ? " [LAST - using actual audio duration]" : ""}`
    );

    segments.push({
      index: index + 1,
      text: sentence.text,
      start: adjustedStart,
      end: adjustedEnd,
    });

    previousEnd = adjustedEnd;
  }

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

