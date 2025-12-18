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
  imageStyle: "A high-quality gouache and watercolor illustration. The image features soft blended colors and painterly textures but creates a fully finished scene. The background is a detailed landscape that fills the entire frame with no empty space. Atmospheric lighting, matte painting style, rich soft colors,  delicate and artistic finish.",
  negativePrompt: "photograph, 3d, vector, oil painting, acrylic, impasto, thick paint, strong outlines, neon colors, watermark, text, deformed, ugly, disfigured, white border, white edges, frame, paper edge, margin, vignette, faded edges, blank space, empty corners, white corners, light edges, unfinished edges",

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

  // === Multi-Image Segmentation ===
  multiImageSegments: true,  // Enable multi-image for longer sentences
  multiImageThreshold: 12,   // Split sentences with >12 words

  // === LLM Context ===
  llmContext: `You are generating image prompts for a historical documentary video.
The visual style is gouache and watercolor illustration with painterly textures.
Focus on:
- Historical accuracy in costumes, settings, and props
- Fully finished scenes with detailed backgrounds filling the entire frame
- Atmospheric lighting with rich, soft colors
- Matte painting style with gentle, balanced compositions
- Clear subject focus with contextual, detailed environments`,
};

