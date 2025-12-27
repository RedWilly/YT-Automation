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
 * - Hand-drawn panel art style
 * - Muted tones with pastel color palette
 * - Soft grain texture
 * - Nostalgic, dreamy aesthetic
 */
export const lofiStyle: VideoStyle = {
    id: 'lofi',
    name: 'Lo-Fi',
    description: '1980s Japanese magazine art style with muted tones and nostalgic aesthetic',

    // === Image Generation ===
    imageStyle: 'hand drawn panel, lo-fi 1980s japanese magazine art style, muted tones, pastel color palette, soft grain, nostalgic aesthetic',
    negativePrompt: 'text, words, letters, numbers, labels, 3D, photorealistic, modern, neon, harsh colors, digital, watermark',

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
    panEffect: true,

    // === LLM Context ===
    llmContext: `Lo-fi 1980s Japanese magazine illustration aesthetic.

COMPOSITION: Hand-drawn panels, vintage manga framing, soft focus backgrounds.
LIGHTING: Soft diffused light, warm afternoon glow, gentle shadows.
COLORS: Muted pastels, faded tones, cream and soft pink accents.
SUBJECTS: Dreamy scenes, everyday moments, quiet contemplation.
TEXTURE: Soft grain, slightly faded like old print media.
CONSTRAINTS: No harsh colors, no modern elements, no digital look., No text, no labels, no numbers.`,
};
