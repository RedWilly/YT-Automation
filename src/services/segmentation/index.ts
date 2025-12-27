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

// =============================================================================
// UNIFIED SEGMENT THRESHOLDS
// Segments are balanced based on BOTH word count AND duration
// =============================================================================

/** Minimum words - merge if below */
const MIN_SEGMENT_WORDS = 6;

/** Maximum words - split if above */
const MAX_SEGMENT_WORDS = 100;

/** Minimum duration (ms) - merge if below */
const MIN_SEGMENT_DURATION_MS = 8000;  // 8s

/** Maximum duration (ms) - split if above */
const MAX_SEGMENT_DURATION_MS = 18000;  // 18s

/** Maximum combined words when merging */
const MAX_MERGED_WORDS = 50;

/** Maximum splits per segment */
const MAX_SPLITS_PER_SEGMENT = 3;

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

  // Balance segments by both word count AND duration (merge short, split long)
  const balancedSegments = balanceSegments(sentences, words);

  logger.success("Segmentation", `Created ${balancedSegments.length} final segments after balancing`);

  return balancedSegments;
}

/**
 * Balance segments by both word count and duration
 * 
 * This unified function handles both merging short segments and splitting long ones.
 * It considers BOTH word count AND duration to avoid conflicts.
 * 
 * Rules:
 * - MERGE: if words < MIN_SEGMENT_WORDS OR duration < MIN_SEGMENT_DURATION_MS
 * - SPLIT: if words > MAX_SEGMENT_WORDS OR duration > MAX_SEGMENT_DURATION_MS
 * 
 * @param sentences - Array of detected sentences
 * @param words - Array of words with timing information (for duration calculation)
 * @returns Array of balanced segments
 */
function balanceSegments(
  sentences: SentenceDetection[],
  words: AssemblyAIWord[]
): SentenceDetection[] {
  if (sentences.length === 0) return sentences;

  // Helper to get duration for a sentence
  const getDuration = (s: SentenceDetection): number => {
    const startWord = words[s.startWordIndex];
    const endWord = words[s.endWordIndex];
    if (!startWord || !endWord) return 0;
    return endWord.end - startWord.start;
  };

  // Helper to check if segment needs merging
  const needsMerge = (s: SentenceDetection): boolean => {
    const duration = getDuration(s);
    return s.wordCount < MIN_SEGMENT_WORDS || duration < MIN_SEGMENT_DURATION_MS;
  };

  // Helper to check if segment needs splitting
  const needsSplit = (s: SentenceDetection): boolean => {
    const duration = getDuration(s);
    return s.wordCount > MAX_SEGMENT_WORDS || duration > MAX_SEGMENT_DURATION_MS;
  };

  // Helper to merge two sentences
  const mergeSentences = (a: SentenceDetection, b: SentenceDetection): SentenceDetection => ({
    text: `${a.text} ${b.text}`.trim(),
    startWordIndex: a.startWordIndex,
    endWordIndex: b.endWordIndex,
    wordCount: a.wordCount + b.wordCount,
  });

  // Helper to split a sentence into chunks
  const splitSentence = (s: SentenceDetection): SentenceDetection[] => {
    const duration = getDuration(s);
    const idealChunks = Math.max(
      Math.ceil(s.wordCount / MAX_SEGMENT_WORDS),
      Math.ceil(duration / MAX_SEGMENT_DURATION_MS)
    );
    const chunks = Math.min(idealChunks, MAX_SPLITS_PER_SEGMENT);

    if (chunks <= 1) return [s];

    const wordsPerChunk = Math.ceil(s.wordCount / chunks);
    const result: SentenceDetection[] = [];
    const sentenceWords = s.text.split(/\s+/);

    for (let i = 0; i < chunks; i++) {
      const startWordOffset = i * wordsPerChunk;
      const endWordOffset = Math.min(startWordOffset + wordsPerChunk - 1, s.wordCount - 1);

      const chunkText = sentenceWords.slice(startWordOffset, endWordOffset + 1).join(" ");
      const chunkWordCount = endWordOffset - startWordOffset + 1;

      result.push({
        text: chunkText,
        startWordIndex: s.startWordIndex + startWordOffset,
        endWordIndex: Math.min(s.startWordIndex + endWordOffset, s.endWordIndex),
        wordCount: chunkWordCount,
      });
    }

    logger.debug(
      "Segmentation",
      `Split segment (${s.wordCount} words, ${Math.round(duration / 1000)}s) into ${chunks} chunks`
    );

    return result;
  };

  let result = [...sentences];
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  // Keep iterating until no more changes
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    const newResult: SentenceDetection[] = [];
    let i = 0;

    while (i < result.length) {
      const current = result[i];
      if (!current) {
        i++;
        continue;
      }

      // STEP 1: Check if current segment needs splitting
      if (needsSplit(current)) {
        const splitChunks = splitSentence(current);
        newResult.push(...splitChunks);
        changed = true;
        i++;
        continue;
      }

      // STEP 2: Check if current segment needs merging
      if (needsMerge(current)) {
        const prev = newResult[newResult.length - 1];
        const next = result[i + 1];

        // Calculate potential merge sizes
        const prevCombined = prev ? prev.wordCount + current.wordCount : Infinity;
        const nextCombined = next ? current.wordCount + next.wordCount : Infinity;

        // Check if merge would be valid (not exceeding max)
        const canMergePrev = prev && prevCombined <= MAX_MERGED_WORDS;
        const canMergeNext = next && nextCombined <= MAX_MERGED_WORDS;

        if (canMergePrev && canMergeNext) {
          // Both options: merge with smaller neighbor
          if (prev!.wordCount <= next!.wordCount) {
            newResult[newResult.length - 1] = mergeSentences(prev!, current);
            logger.debug("Segmentation", `Merged backward: "${current.text.substring(0, 30)}..."`);
          } else {
            newResult.push(mergeSentences(current, next!));
            i++; // Skip next
            logger.debug("Segmentation", `Merged forward: "${current.text.substring(0, 30)}..."`);
          }
          changed = true;
          i++;
          continue;
        } else if (canMergePrev) {
          newResult[newResult.length - 1] = mergeSentences(prev!, current);
          changed = true;
          i++;
          continue;
        } else if (canMergeNext) {
          newResult.push(mergeSentences(current, next!));
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

  if (result.length !== sentences.length) {
    logger.log(
      "Segmentation",
      `Balanced ${sentences.length} → ${result.length} segments (words: ${MIN_SEGMENT_WORDS}-${MAX_SEGMENT_WORDS}, duration: ${MIN_SEGMENT_DURATION_MS / 1000}s-${MAX_SEGMENT_DURATION_MS / 1000}s)`
    );
  }

  return result;
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

