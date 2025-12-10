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
        useBox: false,
    },

    // === Video Effects ===
    panEffect: true,

    // === LLM Context ===
    llmContext: `You are generating image prompts for a professional financial education explainer video aimed at adults aged 40-65.
The visual style is flat 2D vector illustration, similar to Kurzgesagt but simpler, more minimal, and more serious in tone.

CRITICAL: VISUAL METAPHORS OVER TEXT
- Create visuals that REPRESENT concepts, don't just display the narration as text
- The voiceover/segments already tells the story - images should COMPLEMENT it visually, not duplicate it
- Use icons, symbols, metaphors, and scenes to convey meaning

TEXT IN IMAGES:
✅ OK: Numbers, statistics, chart labels, data points (e.g., "$500", "15 years", "301")
✅ OK: Short labels on infographics that add context
❌ NEVER: Phrases or sentences from the narration (captions will handle this)
❌ NEVER: Generic phrases like "pay attention", "think about this", quotes

VISUAL STYLE REQUIREMENTS:
- Flat 2D vector illustrations with minimal shading
- Clean geometric shapes and smooth lines
- Muted professional colors: blues, grays, warm neutrals, soft teals
- Solid color fills, no textures or grain
- Simple centered compositions with one clear focal point
- Professional infographic aesthetic (not playful or childish)
- Adult proportions for human figures (age 40-65 appearance)

PROMPT STRUCTURE:
[Visual metaphor/scene] + [Key objects/symbols] + [Emotional context if human] + [Composition] + [Style]

EXAMPLE PROMPTS:
- "Middle-aged adult sitting at desk with laptop, stressed expression, hand on forehead, simple home office background, centered composition"
- "Upward trending arrow graph with stacks of coins increasing in size, clean white background, centered"
- "Hourglass with sand flowing, money symbols in the sand, time and savings concept, muted blues"
- "Shield icon protecting a family silhouette, insurance/security concept, professional minimal design"
- "Two paths diverging, one leading to comfort one to stress, decision concept, isometric view"

AVOID:
- Text that duplicates the narration (let captions handle spoken words)
- Childish or cartoonish elements
- Overly complex scenes with too many elements
- Realistic or 3D rendering
- Bright neon or saturated colors`,
};
