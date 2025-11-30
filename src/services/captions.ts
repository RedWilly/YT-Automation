/**
 * Caption service for generating word-by-word highlighted captions
 * Uses ASS (Advanced SubStation Alpha) format for karaoke-style highlighting
 * Supports configurable caption styles, karaoke on/off, and highlight colors
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as logger from "../logger.ts";
import type { AssemblyAIWord, TranscriptSegment } from "../types.ts";
import type { ResolvedStyle } from "../styles/types.ts";
import { TMP_VIDEO_DIR } from "../constants.ts";

/**
 * Caption word with precise timing
 */
export interface CaptionWord {
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
}

/**
 * Caption group (3-6 words displayed together)
 */
export interface CaptionGroup {
  words: CaptionWord[];
  start: number; // milliseconds (start of first word)
  end: number; // milliseconds (end of last word)
  text: string; // Full text of the group
}

/**
 * Caption generation result
 */
export interface CaptionResult {
  groups: CaptionGroup[];
  assFilePath: string;
}

/**
 * Generate caption groups from transcript segments and word-level data
 * @param segments - Sentence-based segments from transcript processing
 * @param words - Word-level data from AssemblyAI with precise timestamps
 * @param style - Resolved style configuration for caption settings
 * @returns Caption groups with word-level timing
 */
export function generateCaptionGroups(
  segments: TranscriptSegment[],
  words: AssemblyAIWord[],
  style: ResolvedStyle
): CaptionGroup[] {
  const { minWordsPerCaption, maxWordsPerCaption } = style;
  logger.step("Captions", `Generating caption groups (${minWordsPerCaption}-${maxWordsPerCaption} words per group)`);

  const groups: CaptionGroup[] = [];
  let wordIndex = 0;

  // Process each sentence segment
  for (const segment of segments) {
    const segmentWords: CaptionWord[] = [];

    // Collect words that belong to this segment based on timing
    while (wordIndex < words.length) {
      const word = words[wordIndex];
      if (!word) {
        wordIndex++;
        continue;
      }

      // Check if word belongs to this segment (with some tolerance for timing)
      if (word.start >= segment.start - 100 && word.start <= segment.end + 100) {
        segmentWords.push({
          text: word.text,
          start: word.start,
          end: word.end,
        });
        wordIndex++;
      } else if (word.start > segment.end + 100) {
        // Word is beyond this segment, move to next segment
        break;
      } else {
        // Word is before this segment, skip it
        wordIndex++;
      }
    }

    // Split segment words into groups with configurable word count
    const segmentGroups = splitIntoGroups(segmentWords, minWordsPerCaption, maxWordsPerCaption);
    groups.push(...segmentGroups);
  }

  logger.success("Captions", `Created ${groups.length} caption groups`);
  return groups;
}

/**
 * Split words into groups with configurable word count
 * @param words - Array of caption words
 * @param minWords - Minimum words per group (default: 3)
 * @param maxWords - Maximum words per group (default: 6)
 * @returns Array of caption groups
 */
function splitIntoGroups(
  words: CaptionWord[],
  minWords: number = 3,
  maxWords: number = 6
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  const idealWords = Math.ceil((minWords + maxWords) / 2); // Prefer middle value

  let i = 0;
  while (i < words.length) {
    const remainingWords = words.length - i;

    // Determine group size based on remaining words
    let groupSize: number;
    if (remainingWords <= maxWords) {
      // Last group - take all remaining words
      groupSize = remainingWords;
    } else if (remainingWords === maxWords + 1) {
      // Avoid leaving 1 word alone - split evenly
      groupSize = Math.ceil(remainingWords / 2);
    } else if (remainingWords === maxWords + 2) {
      // Split into two groups of ideal size
      groupSize = idealWords;
    } else {
      // Normal case - use ideal size
      groupSize = idealWords;
    }

    // Ensure group size is within bounds
    groupSize = Math.max(minWords, Math.min(maxWords, groupSize));

    // Create the group
    const groupWords = words.slice(i, i + groupSize);
    const firstWord = groupWords[0];
    const lastWord = groupWords[groupWords.length - 1];

    if (groupWords.length > 0 && firstWord && lastWord) {
      groups.push({
        words: groupWords,
        start: firstWord.start,
        end: lastWord.end,
        text: groupWords.map((w) => w.text).join(" "),
      });
    }

    i += groupSize;
  }

  return groups;
}

/**
 * Convert milliseconds to ASS timestamp format (H:MM:SS.CC)
 * @param ms - Milliseconds
 * @returns ASS timestamp string
 */
function msToAssTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((ms % 1000) / 10);

  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
}

/**
 * Generate ASS subtitle file with configurable styling
 * Supports karaoke highlighting on/off, custom colors, and box/outline styles
 *
 * @param groups - Caption groups with word-level timing
 * @param style - Resolved style configuration
 * @param outputFileName - Output filename (without path)
 * @returns Path to generated ASS file
 */
export async function generateAssSubtitles(
  groups: CaptionGroup[],
  style: ResolvedStyle,
  outputFileName: string = "captions.ass"
): Promise<string> {
  const { captionStyle, highlightStyle } = style;
  const karaokeEnabled = highlightStyle.enabled;

  logger.step("Captions", `Generating ASS subtitle file (karaoke: ${karaokeEnabled ? "on" : "off"})`);

  const assFilePath = join(TMP_VIDEO_DIR, outputFileName);

  // ASS file header with styling
  // BorderStyle: 1 = Outline + drop shadow, 3 = Opaque box
  // Color format: &HAABBGGRR (alpha, blue, green, red in hex) - NOTE: BGR not RGB!
  const defaultBorderStyle = captionStyle.useBox ? 3 : 1;
  const highlightBorderStyle = highlightStyle.useBox ? 3 : 1;

  const assHeader = `[Script Info]
Title: Word-by-Word Highlighted Captions
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${captionStyle.fontName},${captionStyle.fontSize},${captionStyle.primaryColor},&H000000FF,${captionStyle.outlineColor},${captionStyle.backgroundColor},-1,0,0,0,100,100,0,0,${defaultBorderStyle},${captionStyle.outlineWidth},${captionStyle.shadowDepth},2,10,10,130,1
Style: Highlight,${captionStyle.fontName},${captionStyle.fontSize},${captionStyle.primaryColor},&H000000FF,${highlightStyle.color},${highlightStyle.color},-1,0,0,0,100,100,0,0,${highlightBorderStyle},6,0,2,10,10,130,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue lines for each group
  const dialogueLines: string[] = [];

  for (const group of groups) {
    if (karaokeEnabled) {
      // Karaoke mode: create a dialogue line for each word with highlighting
      for (let i = 0; i < group.words.length; i++) {
        const currentWord = group.words[i];
        if (!currentWord) continue;

        // Use continuous timing to avoid gaps/flickering
        const startTime = msToAssTime(currentWord.start);
        const nextWord = group.words[i + 1];
        const endTime = nextWord ? msToAssTime(nextWord.start) : msToAssTime(currentWord.end);

        // Build the text with current word highlighted
        const textParts: string[] = [];
        for (let j = 0; j < group.words.length; j++) {
          const word = group.words[j];
          if (!word) continue;

          if (j === i) {
            // Highlight current word
            textParts.push(`{\\rHighlight}${word.text.toUpperCase()}{\\r}`);
          } else {
            // Normal word
            textParts.push(`{\\rDefault}${word.text.toUpperCase()}{\\r}`);
          }
        }

        const text = textParts.join(" ");
        dialogueLines.push(`Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}`);
      }
    } else {
      // No karaoke: show entire group at once without highlighting
      const firstWord = group.words[0];
      const lastWord = group.words[group.words.length - 1];
      if (!firstWord || !lastWord) continue;

      const startTime = msToAssTime(firstWord.start);
      const endTime = msToAssTime(lastWord.end);
      const text = group.words.map(w => w.text.toUpperCase()).join(" ");

      dialogueLines.push(`Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}`);
    }
  }

  // Combine header and dialogue lines
  const assContent = assHeader + dialogueLines.join("\n");

  // Write to file
  await writeFile(assFilePath, assContent, "utf-8");

  logger.success("Captions", `ASS subtitle file created: ${assFilePath}`);
  logger.log("Captions", `Total dialogue lines: ${dialogueLines.length}`);

  return assFilePath;
}

/**
 * Generate captions and ASS subtitle file from transcript data
 * @param segments - Sentence-based segments from transcript processing
 * @param words - Word-level data from AssemblyAI
 * @param style - Resolved style configuration
 * @param outputFileName - Output filename for ASS file
 * @returns Caption result with groups and ASS file path
 */
export async function generateCaptions(
  segments: TranscriptSegment[],
  words: AssemblyAIWord[],
  style: ResolvedStyle,
  outputFileName: string = "captions.ass"
): Promise<CaptionResult> {
  logger.step("Captions", "Starting caption generation");

  // Generate caption groups with style-specific word count
  const groups = generateCaptionGroups(segments, words, style);

  // Generate ASS subtitle file with style-specific formatting
  const assFilePath = await generateAssSubtitles(groups, style, outputFileName);

  logger.success("Captions", "Caption generation complete");

  return {
    groups,
    assFilePath,
  };
}


