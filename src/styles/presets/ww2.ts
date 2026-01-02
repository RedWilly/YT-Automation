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

  // === Natural Editing ===


  // === LLM Context ===
  // llmContext: `World War 2 documentary aesthetic. Black-and-white archival photography look. High contrast, dramatic lighting, film grain. Period-accurate 1940s military equipment, uniforms, and vehicles. Capture the raw authenticity of war photojournalism.`,
  llmContext: `World War 2 documentary with archival black-and-white photography aesthetic.

COMPOSITION: Cinematic war photographer framing. Wide shots for battlefields, medium shots for soldiers, close-ups for equipment details.
LIGHTING: High contrast, dramatic shadows, film grain texture. Authentic 1940s look.
SUBJECTS: Period-accurate uniforms, vehicles, weapons. Soldiers, civilians, military equipment in action.
CONSTRAINTS: No modern objects, no color, no fantasy elements. Avoid maps/documents unless described as "blurred" or "background".`,
};

