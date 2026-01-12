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
  description: "Documentary style with painterly aesthetic and karaoke captions",

  // === Image Generation ===
  imageStyle: "period-appropriate details, artistic interpretation, rich color palette, painterly quality, atmospheric lighting, creative composition, semi-realistic with stylized elements",
  negativePrompt: "text, words, letters, numbers, labels, captions, typography, photograph, 3d render, vector art, neon colors, watermark, deformed, border, frame, margin",

  // === Segmentation ===
  segmentationType: "sentence",
  wordsPerSegment: 0, // Not used for sentence-based

  // === Captions ===
  captionsEnabled: false,
  minWordsPerCaption: 3,
  maxWordsPerCaption: 6,
  captionStyle: {
    ...DEFAULT_CAPTION_STYLE,
    fontSize: 52,
    primaryColor: "&H00FFFFFF",
    outlineColor: "&H00000000",
    backgroundColor: "&H00000000",  // Black (for shadow effect)
    outlineWidth: 4,  // Thick outline for visibility
    shadowDepth: 4,   // Thick shadow  
    useBox: false, // Outline style for non-highlighted words
    // Position & Layout
    alignment: 2,
    marginV: 130,
    marginVVertical: 550,
    marginL: 10,
    marginR: 10,
    // Text Transform
    scaleX: 100,
    scaleY: 100,
    letterSpacing: 0,
    bold: true,
    italic: false,
    uppercase: true,
  },
  highlightStyle: {
    enabled: true,  // enabled karaoke by default
    color: "&H0000FFFF",  // Yellow (if enabled)
    useBox: false,  // No box - just changes text color
    outlineWidth: 4,
  },

  // === Video Effects ===
  panEffect: false,
};

