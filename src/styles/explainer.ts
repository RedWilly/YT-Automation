/**
 * Explainer style configuration
 * Professional flat 2D illustration style for adult explainer videos
 * Inspired by Kurzgesagt but simpler - clean, minimal, modern
 */

import type { VideoStyle } from "./types.ts";
import { DEFAULT_CAPTION_STYLE, DEFAULT_HIGHLIGHT_STYLE } from "./types.ts";

/**
 * Explainer style - Professional adult explainer video aesthetic
 * 
 * Features:
 * - Word-count based segmentation (80 words per segment)
 * - Flat 2D vector illustration style
 * - Muted professional color palette (blues, grays, warm neutrals)
 * - Clean minimal captions
 * - Pan effect enabled by default
 */
export const explainerStyle: VideoStyle = {
    id: "explainer",
    name: "Explainer",
    description: "Professional flat 2D illustration style for adult financial education videos",

    // === Image Generation ===
    imageStyle: "Flat 2D illustration style, minimal shading, clean vector lines, muted professional color palette (blues, grays, warm neutrals), explainer video aesthetic similar to Kurzgesagt but simpler, no texture, solid colors, modern but not cartoonish",
    negativePrompt: "3D, realistic, photograph, cartoon, anime, childish, texture, grain, heavy shadows, watermark, text, deformed, cluttered, neon colors, sketch",

    // === Segmentation ===
    segmentationType: "sentence",
    wordsPerSegment: 0,

    // === Captions ===
    captionsEnabled: true,
    minWordsPerCaption: 4,
    maxWordsPerCaption: 7,
    captionStyle: {
        ...DEFAULT_CAPTION_STYLE,
        fontName: "Resolve-Bold",
        fontSize: 64,
        primaryColor: "&H00FFFFFF",  // White
        outlineColor: "&H00000000",  // Black
        outlineWidth: 2,
        shadowDepth: 0,  // No shadow for clean look
        useBox: false,
    },
    highlightStyle: {
        ...DEFAULT_HIGHLIGHT_STYLE,
        enabled: true,
        color: "&H00FFAA00",  // Blue (professional)
        useBox: true,
    },

    // === Video Effects ===
    panEffect: true,

    // === LLM Context ===
    llmContext: `You are generating image prompts for a professional financial education explainer video aimed at adults aged 40-65.
The visual style is flat 2D vector illustration, similar to Kurzgesagt but simpler, more minimal, and more serious in tone.

VISUAL STYLE REQUIREMENTS:
- Flat 2D vector illustrations with minimal shading
- Clean geometric shapes and smooth lines
- Muted professional colors: blues, grays, warm neutrals, soft teals
- Solid color fills, no textures or grain
- Simple centered compositions with one clear focal point
- Professional infographic aesthetic (not playful or childish)
- Adult proportions for human figures (age 40-65 appearance)

PROMPT STRUCTURE:
[Subject] + [Action/State] + [Emotional tone if human] + [Setting/Context] + [Composition note] + [Visual Style]

EXAMPLE PROMPTS:
- "Middle-aged adult sitting at desk with laptop, stressed expression, hand on forehead, simple home office background, centered composition"
- "Upward trending arrow graph with stacks of coins increasing in size, clean white background, centered"
- "Adult age 50-55 looking confident with arms crossed, relieved smile, neutral gray background, front-facing"
- "Piggy bank with dollar bills and coins around it, savings concept, muted blue tones, simple clean background"
- "Calendar pages flipping showing passage of time, 15-year timeline concept, minimal design"
- "Two adults reviewing documents together at table, collaborative planning scene, warm office lighting"

TONE CONSIDERATIONS:
- Focus on clarity and professionalism over aesthetic flair

AVOID:
- Childish or cartoonish elements
- Overly complex scenes
- Realistic or 3D rendering
- Bright neon or saturated colors`,
};
