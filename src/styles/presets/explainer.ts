/**
 * Explainer style configuration
 * Clean modern animation style for adult explainer videos
 * Smooth shapes, soft shading, friendly but professional
 */

import type { VideoStyle } from "../types.ts";
import { DEFAULT_CAPTION_STYLE, DEFAULT_HIGHLIGHT_STYLE } from "../types.ts";

/**
 * Explainer style - Clean modern animation for adult education
 * 
 * Features:
 * - Sentence-based segmentation
 * - Smooth shapes with soft shading
 * - Muted professional colors (blues, grays, warm neutrals)
 * - Clean minimal captions
 * - Pan effect enabled by default
 */
export const explainerStyle: VideoStyle = {
    id: "explainer",
    name: "Explainer",
    description: "Clean modern animation style for adult education videos",

    // === Image Generation ===
    imageStyle: "Clean modern animation style with smooth shapes, soft shading and simple lines. Characters and objects are slightly stylized for a friendly look, but still suitable for adults. Colors stay muted and professional, using blues, grays and warm neutrals. Surfaces stay neat with no heavy textures or harsh outlines.",
    //not needed because we use google imagefx (negative prompt not needed) but other imagegen require it
    negativePrompt: "3D, realistic, photograph, cartoon, anime, childish, harsh outlines, heavy textures, watermark, text, deformed, cluttered, neon colors, sketch, overly detailed",

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

    // === Natural Editing ===
    naturalEdit: false,  // Keep single image per segment

    // === LLM Context ===
    llmContext: `You are generating image prompts for a professional adult education explainer video.
The visual style is clean modern animation with smooth shapes, soft shading, and simple lines.

CRITICAL RULES:
- Adult figures aged 40-65 when showing people (unless otherwise specified)
- Each image must visually represent its specific segment's content - they must MATCH
- Use visual metaphors (icons, symbols, scenes) NOT text from the narration
- Numbers/stats in images are OK (e.g., "$500", "15 years"), but never phrases

PROMPT STRUCTURE:
[Visual metaphor/scene] + [Key objects/symbols] + [Emotional context if human] + [Composition]`,
};

