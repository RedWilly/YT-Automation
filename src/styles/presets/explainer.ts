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
    imageStyle: "modern animation, smooth shapes, soft shading, muted professional colors, clean minimal, friendly stylized",
    negativePrompt: "text, words, letters, numbers, labels, 3D, photograph, cartoon, anime, harsh outlines, watermark, deformed",

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


    // === LLM Context ===
    // llmContext: `Modern animation style for adult education. Smooth shapes, soft shading, muted professional colors (blues, grays, warm neutrals). Use visual metaphors and symbols. Characters should be adults aged 40-65 when applicable.`,
    llmContext: `Modern animation style for professional adult education.

SUBJECTS: Adults aged 40-65 when showing people (not young/childish). Professional settings, office environments, business contexts.
COMPOSITION: Clean framing, smooth shapes, balanced layouts. Soft shading, no harsh outlines.
COLORS: Muted professional palette (blues, grays, warm neutrals). No neon or childish colors.
VISUAL METAPHORS: Replace concepts with symbols → money stack (wealth), calendar icon (time), upward arrow (growth), handshake (agreement).
CONSTRAINTS: No text, no labels, no nametags, no chart labels. Everything purely visual.`,
};

