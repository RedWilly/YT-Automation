/**
 * World War 2 style configuration
 * Realistic black-and-white documentary aesthetic with archival photography feel
 */

import type { VideoStyle } from "../types.ts";

/**
 * WW2 style - Historical photojournalism aesthetic
 * 
 * Features:
 * - Word-count based segmentation (100 words per segment)
 * - Black-and-white archival photography style
 * - White text with thick black shadow (no karaoke by default)
 * - 5 words per caption group
 * - Pan effect disabled by default
 */
export const ww2Style: VideoStyle = {
  id: "ww2",
  name: "World War 2",
  description: "Realistic black-and-white documentary with archival photography aesthetic",

  // === Image Generation ===
  imageStyle: "black-and-white, WWII documentary, archival photography, high contrast, 1940s military, film grain, photojournalism",
  negativePrompt: "no text, no words, no letters, no numbers, no labels, no captions, no color, modern, cartoon, anime, illustration, watermark, deformed, border, frame, white border, margin, edges, vignette",

  // === Segmentation ===
  segmentationType: "wordCount",
  wordsPerSegment: 30,

  // === Captions ===
  captionsEnabled: true,
  minWordsPerCaption: 6,
  maxWordsPerCaption: 8,
  captionStyle: {
    fontName: "Resolve-Bold",
    fontSize: 52,
    primaryColor: "&H00FFFFFF",  // White
    outlineColor: "&H00000000",  // Black
    backgroundColor: "&H00000000",  // Black (for shadow effect)
    outlineWidth: 4,  // Thick outline for visibility
    shadowDepth: 4,   // Thick shadow
    useBox: false,    // No box, just text with shadow
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

