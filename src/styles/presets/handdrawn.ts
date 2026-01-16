/**
 * Hand-Drawn Explainer style configuration
 * Doodle illustrations with clean lines on pale pastel yellow background
 * Uses visual symbols only - ABSOLUTELY NO TEXT in generated images
 * Consistent stick-figure character design throughout
 */

import type { VideoStyle } from "../types.ts";

/**
 * Hand-Drawn style - Clean explainer video aesthetic
 * 
 * Features:
 * - Very pale pastel yellow background (unique, not cliche white)
 * - Simple stick-figure characters with consistent design
 * - Visual symbols and icons instead of text
 * - Flat colors for emphasis only (optional)
 * - Whiteboard/explainer video feel
 */
export const handdrawnStyle: VideoStyle = {
    id: "handdrawn",
    name: "Hand-Drawn",
    description: "Clean explainer doodles on pale yellow background with simple stick figures",

    // === Image Generation ===
    imageStyle: "hand-drawn doodle, pale yellow background, thin black outlines, stick-figure, flat minimal style, no shading",
    negativePrompt: "text, words, letters, numbers, writing, handwriting, subtitles, captions, lower thirds, title cards, labels, signs, posters, logos, watermarks, signatures, calligraphy, diagrams, charts, infographics, UI, interface, overlays, speech bubbles, comics, memes, annotations, timestamps, dates, years, quotes, dialogue boxes, credits, headlines, typography, photorealistic, 3D, anime, gradients, shading, white background, border, frame, white border, margin, edges, vignette",

    // === Segmentation ===
    segmentationType: "sentence",
    wordsPerSegment: 0, // Not used for sentence-based

    // === Captions ===
    captionsEnabled: true,
    minWordsPerCaption: 3,
    maxWordsPerCaption: 6,
    captionStyle: {
        fontName: "Resolve-Bold",
        fontSize: 72,
        primaryColor: "&H00000000",  // Black text
        outlineColor: "&H00FFFFFF",  // White outline
        backgroundColor: "&H80FFFFFF",  // Semi-transparent white
        outlineWidth: 2,
        shadowDepth: 0,
        useBox: false,
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
        enabled: true,
        color: "&H000000FF",  // Red highlight
        useBox: true,
        outlineWidth: 6,
    },

    // === Video Effects ===
    panEffect: false,  // Static works best for explainer style
};
