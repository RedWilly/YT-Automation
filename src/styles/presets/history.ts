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
  imageStyle: "gouache watercolor illustration of a historical scene, soft blended colors, painterly textures, atmospheric lighting, matte painting, rich soft colors",
  negativePrompt: "no text, no words, no letters, no numbers, no labels, no captions, no titles, no typography, no photograph, no 3d, no vector, no oil painting, no neon colors, no watermark, no deformed, no border, no frame, no white border, no margin, no edges, no vignette",

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

  // === LLM Context ===
  // llmContext: `Historical documentary aesthetic. Focus on period-accurate costumes, architecture, and landscapes. Use atmospheric lighting with rich, warm tones. Every scene should feel like a painting come to life.`,
  llmContext: `Historical documentary with gouache/watercolor illustration aesthetic.

COMPOSITION: Wide establishing shots for landscapes, medium shots for character moments. Fill the entire canvas edge-to-edge with detailed backgrounds.
LIGHTING: Atmospheric, golden hour, soft diffused light. Rich warm tones.
SUBJECTS: Period-accurate costumes, architecture, and props. Every scene should feel like a painting come to life.
CONSTRAINTS: Avoid text-heavy objects (newspapers, signs). If unavoidable, describe them as "distant" or "illegible".`,
};

