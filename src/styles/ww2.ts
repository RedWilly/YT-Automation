/**
 * World War 2 style configuration
 * Realistic black-and-white documentary aesthetic with archival photography feel
 */

import type { VideoStyle } from "./types.ts";

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
  imageStyle: "realistic black-and-white photography, WWII-era documentary style, archival war footage aesthetic, historical photojournalism, dramatic high contrast, film grain texture, period-accurate details, professional war photographer composition, atmospheric lighting, authentic 1940s military equipment and uniforms",
  negativePrompt: "color, colorful, vibrant colors, modern, contemporary, digital, cartoon, anime, painting, illustration, low quality, blurry, watermark, text, signature, bad anatomy, deformed, unrealistic, fantasy, sci-fi, futuristic",

  // === Segmentation ===
  segmentationType: "wordCount",
  wordsPerSegment: 100,

  // === Captions ===
  captionsEnabled: true,
  minWordsPerCaption: 4,
  maxWordsPerCaption: 6,
  captionStyle: {
    fontName: "Resolve-Bold",
    fontSize: 72,
    primaryColor: "&H00FFFFFF",  // White
    outlineColor: "&H00000000",  // Black
    backgroundColor: "&H00000000",  // Black (for shadow effect)
    outlineWidth: 4,  // Thick outline for visibility
    shadowDepth: 4,   // Thick shadow
    useBox: false,    // No box, just text with shadow
  },
  highlightStyle: {
    enabled: false,  // No karaoke by default
    color: "&H0000FFFF",  // Yellow (if enabled)
    useBox: false,
  },

  // === Video Effects ===
  panEffect: false,

  // === LLM Context ===
  llmContext: `You are generating image prompts for a World War 2 documentary video.
The visual style matches archival black-and-white photography from the 1940s.

CRITICAL REQUIREMENTS:
- Describe subjects clearly: soldiers, vehicles, machinery, buildings, landscapes
- Include actions, movements, and interactions happening in the scene
- Specify environmental details: weather, time of day, terrain, background elements
- Maintain historical accuracy with period-correct uniforms, vehicles, weapons, and architecture
- Keep focus grounded, immersive, and visually cohesive with archival footage style

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

