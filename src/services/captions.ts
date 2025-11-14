/**
 * Caption service for generating word-by-word highlighted captions
 * Uses ASS (Advanced SubStation Alpha) format for karaoke-style highlighting
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as logger from "../logger.ts";
import type { AssemblyAIWord, TranscriptSegment } from "../types.ts";
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
 * @returns Caption groups with word-level timing
 */
export function generateCaptionGroups(
  segments: TranscriptSegment[],
  words: AssemblyAIWord[]
): CaptionGroup[] {
  logger.step("Captions", "Generating caption groups from transcript");

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

    // Split segment words into groups of 3-6 words (flexible based on natural boundaries)
    const segmentGroups = splitIntoGroups(segmentWords);
    groups.push(...segmentGroups);
  }

  logger.success("Captions", `Created ${groups.length} caption groups`);
  return groups;
}

/**
 * Split words into groups of 3-6 words with natural phrase boundaries
 * @param words - Array of caption words
 * @returns Array of caption groups
 */
function splitIntoGroups(words: CaptionWord[]): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  const minWords = 3;
  const maxWords = 6;
  const idealWords = 4; // Prefer 4 words per group

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
 * Generate ASS subtitle file with word-by-word highlighting
 * @param groups - Caption groups with word-level timing
 * @param outputFileName - Output filename (without path)
 * @returns Path to generated ASS file
 */
export async function generateAssSubtitles(
  groups: CaptionGroup[],
  outputFileName: string = "captions.ass"
): Promise<string> {
  logger.step("Captions", "Generating ASS subtitle file");

  const assFilePath = join(TMP_VIDEO_DIR, outputFileName);

  // ASS file header with styling
  // BorderStyle: 1 = Outline + drop shadow, 3 = Opaque box, 4 = Opaque box + outline
  // Color format: &HAABBGGRR (alpha, blue, green, red in hex) - NOTE: BGR not RGB!
  // For purple/violet (#8B00FF in RGB): Red=8B, Green=00, Blue=FF -> BGR=&H00FF008B
  // For hot pink (#FF69B4 in RGB): Red=FF, Green=69, Blue=B4 -> BGR=&H00B469FF
  //
  // NOTE: ASS format does NOT support rounded corners natively
  // We use BorderStyle=3 (opaque box) which creates rectangular backgrounds
  // For a "softer" appearance, we use generous padding (Outline=12)
  const assHeader = `[Script Info]
Title: Word-by-Word Highlighted Captions
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Resolve-Bold,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1,2,2,10,10,130,1
Style: Highlight,Resolve-Bold,72,&H00FFFFFF,&H000000FF,&H00FF008B,&H00FF008B,-1,0,0,0,100,100,0,0,3,6,0,2,10,10,130,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue lines for each group
  const dialogueLines: string[] = [];

  for (const group of groups) {
    // For each word in the group, create a dialogue line showing the entire group
    // with the current word highlighted
    for (let i = 0; i < group.words.length; i++) {
      const currentWord = group.words[i];
      if (!currentWord) continue;

      // Use continuous timing to avoid gaps/flickering
      // Start time: current word's start
      // End time: next word's start (or current word's end if it's the last word)
      const startTime = msToAssTime(currentWord.start);
      const nextWord = group.words[i + 1];
      const endTime = nextWord ? msToAssTime(nextWord.start) : msToAssTime(currentWord.end);

      // Build the text with current word highlighted
      // Use \rStyleName to switch between Default and Highlight styles
      const textParts: string[] = [];
      for (let j = 0; j < group.words.length; j++) {
        const word = group.words[j];
        if (!word) continue;

        if (j === i) {
          // Highlight current word - switch to Highlight style (BorderStyle=3 with purple box)
          textParts.push(`{\\rHighlight}${word.text.toUpperCase()}{\\r}`);
        } else {
          // Normal word - use Default style (BorderStyle=1 with black outline)
          textParts.push(`{\\rDefault}${word.text.toUpperCase()}{\\r}`);
        }
      }

      const text = textParts.join(" ");
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
 * @param outputFileName - Output filename for ASS file
 * @returns Caption result with groups and ASS file path
 */
export async function generateCaptions(
  segments: TranscriptSegment[],
  words: AssemblyAIWord[],
  outputFileName: string = "captions.ass"
): Promise<CaptionResult> {
  logger.step("Captions", "Starting caption generation");

  // Generate caption groups
  const groups = generateCaptionGroups(segments, words);

  // Generate ASS subtitle file
  const assFilePath = await generateAssSubtitles(groups, outputFileName);

  logger.success("Captions", "Caption generation complete");

  return {
    groups,
    assFilePath,
  };
}


