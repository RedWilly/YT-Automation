/**
 * Sentence-based segmentation service for intelligent transcript chunking
 * 
 * This module provides smart sentence-based segmentation that:
 * - Detects sentence boundaries using punctuation (.!?)
 * - Handles common abbreviations (U.S., Dr., Mrs., Mr., etc.)
 * - Merges very short consecutive sentences for better flow
 * - Preserves word timing information from the original transcript
 */

import type { AssemblyAIWord } from "../../types/index.ts";
import * as logger from "../../utils/logger.ts";

/**
 * Common abbreviations that should NOT be treated as sentence endings
 * These patterns will be protected from sentence splitting
 */
const COMMON_ABBREVIATIONS = [
  "U.S.",
  "U.K.",
  "Dr.",
  "Mr.",
  "Mrs.",
  "Ms.",
  "Prof.",
  "Sr.",
  "Jr.",
  "Inc.",
  "Ltd.",
  "Corp.",
  "Co.",
  "etc.",
  "vs.",
  "e.g.",
  "i.e.",
  "a.m.",
  "p.m.",
  "A.M.",
  "P.M.",
  "J.P."
];

/**
 * Represents a detected sentence with its word indices
 */
export interface SentenceDetection {
  text: string;
  startWordIndex: number;
  endWordIndex: number;
  wordCount: number;
}

/**
 * Segment transcript words into intelligent sentence-based chunks
 * 
 * @param words - Array of words from AssemblyAI transcription with timing info
 * @returns Array of sentence detections with word indices
 */
export function segmentBySentences(words: AssemblyAIWord[]): SentenceDetection[] {
  logger.step("Segmentation", `Segmenting ${words.length} words into sentences`);

  // Build full text from words
  const fullText = words.map(w => w.text).join(" ");

  // Protect abbreviations by temporarily replacing them
  let protectedText = fullText;
  const abbreviationMap = new Map<string, string>();

  COMMON_ABBREVIATIONS.forEach((abbr, index) => {
    const placeholder = `__ABBR${index}__`;
    abbreviationMap.set(placeholder, abbr);
    // Use regex to replace all occurrences, case-insensitive
    const regex = new RegExp(abbr.replace(/\./g, "\\."), "gi");
    protectedText = protectedText.replace(regex, placeholder);
  });

  // Split by sentence boundaries (.!?)
  // Pattern: capture everything up to and including a sentence-ending punctuation
  const sentencePattern = /[^.!?]+[.!?]+/g;
  const rawSentences = protectedText.match(sentencePattern) || [];

  // Restore abbreviations in detected sentences
  const restoredSentences = rawSentences.map(sentence => {
    let restored = sentence;
    abbreviationMap.forEach((abbr, placeholder) => {
      restored = restored.replace(new RegExp(placeholder, "g"), abbr);
    });
    return restored.trim();
  });

  // Handle any remaining text that doesn't end with punctuation
  const lastSentenceEnd = rawSentences.join("").length;
  if (lastSentenceEnd < protectedText.length) {
    let remaining = protectedText.substring(lastSentenceEnd).trim();
    // Restore abbreviations in remaining text
    abbreviationMap.forEach((abbr, placeholder) => {
      remaining = remaining.replace(new RegExp(placeholder, "g"), abbr);
    });
    if (remaining.length > 0) {
      restoredSentences.push(remaining);
    }
  }

  // Map sentences to word indices
  const sentences: SentenceDetection[] = [];
  let currentWordIndex = 0;

  for (const sentenceText of restoredSentences) {
    // Skip empty or punctuation-only sentences
    if (!sentenceText || sentenceText.replace(/[.!?,;:\s]/g, "").length === 0) {
      continue;
    }

    // Count words in this sentence
    const sentenceWords = sentenceText.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = sentenceWords.length;

    if (wordCount === 0) continue;

    const startWordIndex = currentWordIndex;
    const endWordIndex = Math.min(currentWordIndex + wordCount - 1, words.length - 1);

    sentences.push({
      text: sentenceText,
      startWordIndex,
      endWordIndex,
      wordCount,
    });

    currentWordIndex = endWordIndex + 1;

    // Safety check: don't exceed word array bounds
    if (currentWordIndex >= words.length) break;
  }

  logger.debug("Segmentation", `Detected ${sentences.length} raw sentences`);

  // Merge very short consecutive sentences
  const mergedSentences = mergeShortSentences(sentences);

  logger.success("Segmentation", `Created ${mergedSentences.length} final segments after merging`);

  return mergedSentences;
}

/**
 * Merge short sentences for natural flow
 *
 * Rules:
 * 1. ≤3 words → MUST merge (with shorter neighbor)
 * 2. ≤6 words → SHOULD merge if combined ≤15 words
 * 3. Bidirectional: prefer merging with the shorter neighbor
 *
 * @param sentences - Array of detected sentences
 * @returns Array of sentences after merging short ones
 */
function mergeShortSentences(sentences: SentenceDetection[]): SentenceDetection[] {
  if (sentences.length <= 1) return sentences;

  let result = [...sentences];
  let changed = true;

  // Keep iterating until no more merges are possible
  while (changed) {
    changed = false;
    const newResult: SentenceDetection[] = [];
    let i = 0;

    while (i < result.length) {
      const current = result[i];
      if (!current) {
        i++;
        continue;
      }

      const prev = newResult[newResult.length - 1];
      const next = result[i + 1];

      // Rule 1: ≤3 words MUST merge
      // Rule 2: ≤6 words SHOULD merge if result ≤15 words
      const mustMerge = current.wordCount <= 3;
      const shouldMerge = current.wordCount <= 6;

      if (mustMerge || shouldMerge) {
        // Calculate potential merge sizes
        const prevCombined = prev ? prev.wordCount + current.wordCount : Infinity;
        const nextCombined = next ? current.wordCount + next.wordCount : Infinity;

        // Determine best merge direction
        const canMergePrev = prev && prevCombined <= 15;
        const canMergeNext = next && nextCombined <= 15;

        if (mustMerge) {
          // MUST merge - pick the shorter neighbor
          if (canMergePrev && canMergeNext) {
            // Both options: merge with shorter
            if (prev!.wordCount <= next!.wordCount) {
              // Merge backward
              const merged = mergeTwoSentences(prev!, current);
              newResult[newResult.length - 1] = merged;
              logger.debug("Segmentation", `Merged ≤3 backward: "${current.text.substring(0, 30)}..."`);
              changed = true;
              i++;
              continue;
            } else {
              // Merge forward
              const merged = mergeTwoSentences(current, next!);
              newResult.push(merged);
              logger.debug("Segmentation", `Merged ≤3 forward: "${current.text.substring(0, 30)}..."`);
              changed = true;
              i += 2;
              continue;
            }
          } else if (canMergePrev) {
            // Merge backward only
            const merged = mergeTwoSentences(prev!, current);
            newResult[newResult.length - 1] = merged;
            changed = true;
            i++;
            continue;
          } else if (canMergeNext) {
            // Merge forward only
            const merged = mergeTwoSentences(current, next!);
            newResult.push(merged);
            changed = true;
            i += 2;
            continue;
          }
          // Can't merge - keep as is
        } else if (shouldMerge && canMergeNext && next!.wordCount <= 6) {
          // SHOULD merge - only if BOTH are short
          const merged = mergeTwoSentences(current, next!);
          newResult.push(merged);
          logger.debug("Segmentation", `Merged both short: "${merged.text.substring(0, 40)}..."`);
          changed = true;
          i += 2;
          continue;
        }
      }

      // No merge - keep current
      newResult.push(current);
      i++;
    }

    result = newResult;
  }

  return result;
}

/**
 * Helper to merge two sentences
 */
function mergeTwoSentences(a: SentenceDetection, b: SentenceDetection): SentenceDetection {
  return {
    text: `${a.text} ${b.text}`.trim(),
    startWordIndex: a.startWordIndex,
    endWordIndex: b.endWordIndex,
    wordCount: a.wordCount + b.wordCount,
  };
}

/**
 * Get timestamp range for a sentence based on word indices
 *
 * @param words - Array of words with timing information
 * @param startWordIndex - Starting word index for the sentence
 * @param endWordIndex - Ending word index for the sentence
 * @returns Object with start and end timestamps in milliseconds
 */
export function getSentenceTimestamps(
  words: AssemblyAIWord[],
  startWordIndex: number,
  endWordIndex: number
): { start: number; end: number } {
  const startWord = words[startWordIndex];
  const endWord = words[endWordIndex];

  if (!startWord || !endWord) {
    throw new Error(
      `Invalid word indices: start=${startWordIndex}, end=${endWordIndex}, words.length=${words.length}`
    );
  }

  return {
    start: startWord.start,
    end: endWord.end,
  };
}

/**
 * Segment transcript words into fixed word-count chunks
 * Used for styles like WW2 that need consistent segment sizes
 *
 * @param words - Array of words from AssemblyAI transcription with timing info
 * @param wordsPerSegment - Number of words per segment (e.g., 100)
 * @returns Array of sentence detections with word indices
 */
export function segmentByWordCount(
  words: AssemblyAIWord[],
  wordsPerSegment: number
): SentenceDetection[] {
  logger.step("Segmentation", `Segmenting ${words.length} words into ~${wordsPerSegment} words (sentence-aware)`);

  if (wordsPerSegment <= 0) {
    throw new Error("wordsPerSegment must be a positive number");
  }

  // Tolerance: how many extra words we'll scan looking for a sentence end
  const SENTENCE_SEARCH_TOLERANCE = Math.ceil(wordsPerSegment * 0.3);
  const segments: SentenceDetection[] = [];
  const totalWords = words.length;
  let currentIndex = 0;

  while (currentIndex < totalWords) {
    const startWordIndex = currentIndex;
    const targetEndIndex = Math.min(currentIndex + wordsPerSegment - 1, totalWords - 1);
    const maxSearchIndex = Math.min(targetEndIndex + SENTENCE_SEARCH_TOLERANCE, totalWords - 1);

    // Find the best cut point (sentence ending) near the target
    let endWordIndex = targetEndIndex;

    // Search forward from target to find a sentence-ending word
    for (let i = targetEndIndex; i <= maxSearchIndex; i++) {
      const word = words[i];
      if (word && /[.!?]$/.test(word.text)) {
        endWordIndex = i;
        break;
      }
    }

    // If no sentence ending found forward, search backward from target
    if (endWordIndex === targetEndIndex) {
      for (let i = targetEndIndex - 1; i >= startWordIndex; i--) {
        const word = words[i];
        if (word && /[.!?]$/.test(word.text)) {
          endWordIndex = i;
          break;
        }
      }
    }

    // Build text from words in this segment
    const segmentWords: string[] = [];
    for (let i = startWordIndex; i <= endWordIndex; i++) {
      const word = words[i];
      if (word) {
        segmentWords.push(word.text);
      }
    }

    const text = segmentWords.join(" ");
    const wordCount = endWordIndex - startWordIndex + 1;

    segments.push({
      text,
      startWordIndex,
      endWordIndex,
      wordCount,
    });

    logger.debug(
      "Segmentation",
      `Word-count segment ${segments.length}: "${text.substring(0, 50)}..." (${wordCount} words)`
    );

    currentIndex = endWordIndex + 1;
  }

  logger.success("Segmentation", `Created ${segments.length} sentence-aware word-count segments`);

  return segments;
}

