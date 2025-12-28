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
    negativePrompt: "text, words, letters, numbers, labels, photorealistic, 3D, anime, gradients, shading, white background, border, frame, white border, margin, edges, vignette",

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


    // === LLM Context ===
    // llmContext: `Hand-drawn doodle style on pale pastel yellow background. Simple stick-figure characters with rounded heads and dot eyes. Use visual icons and symbols instead of text. Flat, clean minimal style with thin black outlines and no shading.`,
    llmContext: `Hand-drawn doodle explainer on pale pastel yellow background.

CHARACTER: Simple stick-figure with round head, dot eyes, curved mouth. Thin black outlines, flat minimal style. Same character design in every image.
VISUAL SYMBOLS: Replace all text with icons → clock hands only (no numbers), hourglass (time), lightbulb (ideas), question mark (confusion), checkmark (success), X mark (failure), arrows (movement).
COMPOSITION: Centered subject, ample whitespace, one concept per image. Minimal environment with simple geometric props.
COLORS: Pale yellow background mandatory. Black outlines only. Flat accent colors for emphasis (red shirt, yellow lightbulb).
CONSTRAINTS: No text, no labels, no numbers, no shading, no gradients, no 3D.`,
};
