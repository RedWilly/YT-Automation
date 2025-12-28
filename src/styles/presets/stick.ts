/**
 * Stick style configuration
 * Minimalist white line stick figures on black background
 * Uses only visual symbols - no text in generated images
 * Consistent character design with round heads and dot eyes
 */

import type { VideoStyle } from "../types.ts";

/**
 * Stick style - Ultra-minimal white-on-black illustrations
 * 
 * Features:
 * - White line figures on pure black background
 * - Consistent character anatomy (round head, dot eyes, curved mouth)
 * - Uses icons, bubbles, signs instead of text
 * - Sentence-based segmentation
 * - Karaoke captions enabled
 */
export const stickStyle: VideoStyle = {
    id: "stick",
    name: "Stick",
    description: "White line stick figures on black background, consistent round-head characters with expressive faces",

    // === Image Generation ===
    imageStyle: "stick figure, white lines on black background, round head, dot eyes, 2D flat, high contrast, minimal",
    negativePrompt: "text, words, letters, numbers, labels, 3d, realistic, color, shading, watermark, border, frame, white border, margin, edges, vignette",

    // === Segmentation ===
    segmentationType: "sentence",
    wordsPerSegment: 0, // Not used for sentence-based

    // === Captions ===
    captionsEnabled: true,
    minWordsPerCaption: 3,
    maxWordsPerCaption: 6,
    captionStyle: {
        fontName: "Resolve-Bold",
        fontSize: 42,
        primaryColor: "&H00FFFFFF",  // White text
        outlineColor: "&H00000000",  // Black outline
        backgroundColor: "&H80000000",  // Semi-transparent black
        outlineWidth: 2,
        shadowDepth: 0,
        useBox: false,
        // Position & Layout
        alignment: 2,  // Bottom center
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
        enabled: false,
        color: "&H0000FFFF",  // Yellow highlight
        useBox: true,
        outlineWidth: 6,
    },

    // === Video Effects ===
    panEffect: false,  // Static images work better for stick figures

    // === LLM Context ===
    // llmContext: `White stick figures on pure black background. Round circle heads with dot eyes and curved mouths for expressions. Use visual symbols (icons, arrows, thought bubbles) instead of text. Focus on expressive poses and clear body language.`,
    llmContext: `Minimalist stick figure animation on pure black background.

CHARACTER: Round circle head, dot eyes, curved line mouth (smile/frown/neutral). Thin white line body, stick limbs. Consistent anatomy in every image.
EXPRESSIONS: Happy = curved smile, Sad = downturned mouth, Confused = wavy mouth, Surprised = O mouth.
VISUAL SYMBOLS: Use icons instead of text → lightbulb (ideas), question mark (confusion), exclamation (emphasis), arrows (direction), heart (love), thought bubbles (thinking).
COMPOSITION: Centered subject, pure black background, minimal white line props.
CONSTRAINTS: No text, no labels, no numbers. Replace text with icons always.`,
};
