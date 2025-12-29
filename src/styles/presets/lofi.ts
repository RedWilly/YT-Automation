/**
 * Lo-Fi style configuration
 * 1980s Japanese magazine art aesthetic with muted tones and nostalgic feel
 */

import type { VideoStyle } from '../types.ts';
import { DEFAULT_CAPTION_STYLE, DEFAULT_HIGHLIGHT_STYLE } from '../types.ts';

/**
 * Lo-Fi style - Nostalgic 1980s Japanese magazine aesthetic
 * 
 * Features:
 * - Hand-drawn scene art style
 * - Muted tones with pastel color palette
 * - Soft grain texture
 * - Nostalgic, dreamy aesthetic
 */
export const lofiStyle: VideoStyle = {
    id: 'lofi',
    name: 'Lo-Fi',
    description: '1980s Japanese magazine lo-fi style',

    // === Image Generation ===
    imageStyle: 'hand drawn scene, lo-fi 1980s japanese magazine art style, muted tones, pastel color palette, soft grain, nostalgic aesthetic, animated',
    negativePrompt: 'text, words, letters, numbers, labels, 3D, photorealistic, modern, neon, harsh colors, digital, watermark, border, frame, white border, margin, edges, vignette, caption',

    // === Segmentation ===
    segmentationType: 'sentence',
    wordsPerSegment: 0,

    // === Captions ===
    captionsEnabled: true,
    minWordsPerCaption: 3,
    maxWordsPerCaption: 6,
    captionStyle: {
        ...DEFAULT_CAPTION_STYLE,
        fontName: 'Resolve-Bold',
        fontSize: 48,
        primaryColor: '&H00FFFFFF',  // White
        outlineColor: '&H00000000',  // Black
        outlineWidth: 2,
        shadowDepth: 0,
        useBox: false,
    },
    highlightStyle: {
        ...DEFAULT_HIGHLIGHT_STYLE,
        enabled: true,
        color: '&H00AAD4FF',  // Soft peach/coral (pastel)
        useBox: true,
    },

    // === Video Effects ===
    panEffect: false,

    // === LLM Context ===
    llmContext: `Lo-fi 1980s Japanese magazine illustration aesthetic.

QUERY FORMAT:
Structure every query like this:
"a hand drawn scene from an old japanese anime about [subject doing action in setting/ Scene]. Lo-fi 1980s japanese magazine art style, muted tones, pastel color palette, soft grain, nostalgic aesthetic, animated."

EXAMPLE:
"a hand drawn scene from an old japanese anime about a woman reading a book in a spaceship. Lo-fi 1980s japanese magazine art style, muted tones, pastel color palette, soft grain, nostalgic aesthetic, animated."
"a hand drawn scene from an old japanese anime about two friends walking through a neon-lit city at night. Lo-fi 1980s japanese magazine art style, muted tones, pastel color palette, soft grain, nostalgic aesthetic, animated."`,
};
