/**
 * Sentence-based segmentation service for intelligent transcript chunking
 * 
 * This module provides smart sentence-based segmentation that:
 * - Detects sentence boundaries using punctuation (.!?)
 * - Handles common abbreviations (U.S., Dr., Mrs., Mr., etc.)
 * - Merges very short consecutive sentences for better flow
 * - Preserves word timing information from the original transcript
 */

import type { AssemblyAIWord } from "../types.ts";
import * as logger from "../logger.ts";

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
];

/**
 * Represents a detected sentence with its word indices
 */
interface SentenceDetection {
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
 * Merge very short consecutive sentences for better flow
 *
 * Rules:
 * 1. If sentence has ≤2 words, ALWAYS merge with next sentence (if exists)
 * 2. If sentence has ≤5 words AND next sentence has ≤5 words, merge them
 *
 * @param sentences - Array of detected sentences
 * @returns Array of sentences after merging short ones
 */
function mergeShortSentences(sentences: SentenceDetection[]): SentenceDetection[] {
  if (sentences.length === 0) return [];

  const merged: SentenceDetection[] = [];
  let i = 0;

  while (i < sentences.length) {
    const current = sentences[i];
    if (!current) {
      i++;
      continue;
    }

    const next = sentences[i + 1];

    // Rule 1: Very short sentences (≤2 words) ALWAYS merge with next
    // This handles cases like "But." or "However." appearing alone
    if (next && current.wordCount <= 2) {
      const mergedText = `${current.text} ${next.text}`.trim();
      const mergedWordCount = current.wordCount + next.wordCount;

      merged.push({
        text: mergedText,
        startWordIndex: current.startWordIndex,
        endWordIndex: next.endWordIndex,
        wordCount: mergedWordCount,
      });

      logger.debug(
        "Segmentation",
        `Merged very short sentence (≤2 words): "${current.text}" + "${next.text}" → "${mergedText}"`
      );

      i += 2;
    }
    // Rule 2: Both sentences are short (≤5 words), merge them
    else if (next && current.wordCount <= 5 && next.wordCount <= 5) {
      const mergedText = `${current.text} ${next.text}`.trim();
      const mergedWordCount = current.wordCount + next.wordCount;

      merged.push({
        text: mergedText,
        startWordIndex: current.startWordIndex,
        endWordIndex: next.endWordIndex,
        wordCount: mergedWordCount,
      });

      logger.debug(
        "Segmentation",
        `Merged short sentences (both ≤5 words): "${current.text}" + "${next.text}" → "${mergedText}"`
      );

      i += 2;
    } else {
      // Keep current sentence as-is
      merged.push(current);
      i++;
    }
  }

  return merged;
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

