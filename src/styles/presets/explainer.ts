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
    negativePrompt: "no text, no words, no letters, no numbers, no labels, no 3D, no photograph, no cartoon, no anime, no harsh outlines, no watermark, no deformed, no border, no frame, no white border, no margin, no edges, no vignette",

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
};

