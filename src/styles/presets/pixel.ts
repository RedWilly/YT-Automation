/**
 * Pixel style configuration
 * Nostalgic video game pixel art aesthetic
 */

import type { VideoStyle } from '../types.ts';
import { DEFAULT_CAPTION_STYLE, DEFAULT_HIGHLIGHT_STYLE } from '../types.ts';

/**
 * Pixel style - Nostalgic video game pixel art
 * 
 * Features:
 * - Pixel art aesthetic
 * - Reminiscent of classic video games
 * - Retro, nostalgic feel
 */
export const pixelStyle: VideoStyle = {
    id: 'pixel',
    name: 'Pixel',
    description: 'Nostalgic video game pixel art style',

    // === Image Generation ===
    imageStyle: 'pixel art. pixelated scene reminiscent of a nostalgic video game.',
    negativePrompt: 'text, words, letters, numbers, writing, handwriting, subtitles, captions, lower thirds, title cards, labels, signs, posters, logos, watermarks, signatures, calligraphy, diagrams, charts, infographics, UI, interface, overlays, speech bubbles, comics, memes, annotations, timestamps, dates, years, quotes, dialogue boxes, credits, headlines, typography, 3D, photorealistic, blurry, smooth gradients, border, frame, white border, margin, edges, vignette',

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
        outlineWidth: 3,
        shadowDepth: 0,
        useBox: false,
    },
    highlightStyle: {
        ...DEFAULT_HIGHLIGHT_STYLE,
        enabled: true,
        color: '&H0000FFFF',  // Yellow (retro gaming feel)
        useBox: true,
    },

    // === Video Effects ===
    panEffect: false,
};
