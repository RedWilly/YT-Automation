/**
 * History style configuration
 * Default documentary style with sentence-based segmentation and karaoke captions
 */

import type { VideoStyle } from "../types.ts";
import { DEFAULT_CAPTION_STYLE, DEFAULT_HIGHLIGHT_STYLE } from "../types.ts";

/**
 * History style - the original default style
 * 
 * Features:
 * - Sentence-based segmentation (natural speech breaks)
 * - Watercolor painting aesthetic (soft washes, gentle blending)
 * - Karaoke-style word highlighting (purple box)
 * - 3-6 words per caption group
 * - Pan effect enabled by default
 */
export const historyStyle: VideoStyle = {
  id: "history",
  name: "History",
  description: "Classic documentary style with gouache illustration aesthetic and karaoke captions",

  // === Image Generation ===
  imageStyle: "gouache watercolor illustration, soft blended colors, painterly textures, atmospheric lighting, matte painting, rich soft colors, detailed background",
  negativePrompt: "text, words, letters, numbers, labels, captions, titles, typography, photograph, 3d, vector, oil painting, neon colors, watermark, deformed",

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
  panEffect: false,

  // === Natural Editing ===
  naturalEdit: true,  // Enable time-based splitting and b-roll types

  // === LLM Context ===
  llmContext: `You are generating image prompts for a historical documentary video.
The visual style is gouache and watercolor illustration with painterly textures.
Focus on:
- Historical accuracy in costumes, settings, and props
- Fully finished scenes with detailed backgrounds filling the entire frame
- Atmospheric lighting with rich, soft colors
- Matte painting style with gentle, balanced compositions
- Clear subject focus with contextual, detailed environments
- ABSOLUTELY NO TEXT, LABELS, or CAPTIONS in the image
- Avoid text-heavy objects (newspapers, signs) or explicitly describe them as "illegible" or "distant"`,
};

