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
  negativePrompt: "text, words, letters, numbers, labels, captions, color, modern, cartoon, anime, illustration, watermark, deformed",

  // === Segmentation ===
  segmentationType: "wordCount",
  wordsPerSegment: 100,

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
  naturalEdit: false,  // Uses word-count segmentation

  // === LLM Context ===
  llmContext: `You are generating image prompts for a World War 2 documentary video.
The visual style matches archival black-and-white photography from the 1940s.

CRITICAL REQUIREMENTS:
- Describe subjects clearly: soldiers, vehicles, machinery, buildings, landscapes
- Include actions, movements, and interactions happening in the scene
- Specify environmental details: weather, time of day, terrain, background elements
- Maintain historical accuracy with period-correct uniforms, vehicles, weapons, and architecture
- Keep focus grounded, immersive, and visually cohesive with archival footage style
- ABSOLUTELY NO TEXT, LABELS, COUNTDOWNS, or DATES in the image
- Avoid showing maps, documents, or newspapers unless described as "blurred" or "illegible"

VISUAL STYLE:
- Black-and-white documentary aesthetic
- High contrast, dramatic lighting
- Film grain texture
- Professional war photographer composition
- Authentic 1940s military equipment

EXAMPLE PROMPTS:
- "American soldiers advancing through bombed French village streets, debris and smoke in background, overcast sky, 1944 Normandy"
- "B-17 bomber crew preparing aircraft on English airfield, ground crew loading ammunition, early morning fog, 1943"
- "German Panzer tank column moving through Eastern European forest road, soldiers riding on hulls, dust clouds, summer 1941"`,
};

