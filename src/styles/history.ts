/**
 * History style configuration
 * Default documentary style with sentence-based segmentation and karaoke captions
 */

import type { VideoStyle } from "./types.ts";
import { DEFAULT_CAPTION_STYLE, DEFAULT_HIGHLIGHT_STYLE } from "./types.ts";

/**
 * History style - the original default style
 * 
 * Features:
 * - Sentence-based segmentation (natural speech breaks)
 * - Oil painting aesthetic (alla prima, classical)
 * - Karaoke-style word highlighting (purple box)
 * - 3-6 words per caption group
 * - Pan effect enabled by default
 */
export const historyStyle: VideoStyle = {
  id: "history",
  name: "History",
  description: "Classic documentary style with oil painting aesthetic and karaoke captions",

  // === Image Generation ===
  imageStyle: "classical oil painting, smooth blended transitions, photorealistic detail, museum quality finish, rich varnished appearance, balanced natural lighting, muted sophisticated color palette, highly refined and polished, masterful technique.",
  negativePrompt: "photorealistic, photograph, 3d render, digital art, vector, cartoon, anime, cel shaded, ink, watercolor, pencil sketch, blurry, low quality, watermark, text, signature, bad anatomy, deformed, disfigured, extra limbs, missing fingers, ugly face, plastic skin, glossy, airbrushed, heavy impasto, thick paint, rough texture",

  // === Segmentation ===
  segmentationType: "sentence",
  wordsPerSegment: 0, // Not used for sentence-based

  // === Captions ===
  captionsEnabled: true,
  minWordsPerCaption: 3,
  maxWordsPerCaption: 6,
  captionStyle: {
    ...DEFAULT_CAPTION_STYLE,
    useBox: false, // Outline style for non-highlighted words
  },
  highlightStyle: {
    ...DEFAULT_HIGHLIGHT_STYLE,
    enabled: true,
    color: "&H00FF008B", // Purple
    useBox: true,
  },

  // === Video Effects ===
  panEffect: true,

  // === LLM Context ===
  llmContext: `You are generating image prompts for a historical documentary video.
The visual style is classical oil painting with an elegant, refined aesthetic.
Focus on:
- Historical accuracy in costumes, settings, and props
- Dramatic yet balanced compositions
- Clear subject focus with contextual backgrounds
- Natural, warm lighting typical of classical paintings`,
};

