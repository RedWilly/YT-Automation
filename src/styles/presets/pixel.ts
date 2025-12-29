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
    // Note: The style suffix "pixelated scene reminiscent of a nostalgic video game" is added via llmContext
    negativePrompt: 'text, words, letters, numbers, labels, 3D, photorealistic, blurry, smooth gradients, watermark, border, frame, white border, margin, edges, vignette',

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

    // === LLM Context ===
    llmContext: `Pixel art style for nostalgic video game aesthetic.

QUERY FORMAT (IMPORTANT - override default pattern):
Structure every query EXACTLY like this:
"pixel art of [subject doing action in setting]. pixelated scene reminiscent of a nostalgic video game."

EXAMPLE:
"pixel art of a determined young woman in a Soviet uniform holding a sniper rifle, standing in a snowy, war-torn landscape. pixelated scene reminiscent of a nostalgic video game."
"pixel art of two people resting near a campfire at night in vast ruins. pixelated scene reminiscent of a nostalgic video game."

Keep queries simple and focused. Do not add extra keywords or modifiers.`,
};
