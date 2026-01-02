/**
 * Cinematic style configuration
 * Black and white with muted color accents, painterly-realistic ASMR aesthetic
 */

import type { VideoStyle } from '../types.ts';
import { DEFAULT_CAPTION_STYLE, DEFAULT_HIGHLIGHT_STYLE } from '../types.ts';

/**
 * Cinematic style - dramatic black and white with subtle color accents
 *
 * Features:
 * - Sentence-based segmentation (natural speech breaks)
 * - Painterly-realistic aesthetic with ASMR atmosphere
 * - Shallow depth of field with atmospheric effects
 * - Period-accurate attire with tactile details
 * - Karaoke-style word highlighting
 * - 3-6 words per caption group
 */
export const cinematicStyle: VideoStyle = {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Dramatic black and white with muted color accents, painterly-realistic ASMR atmosphere',

    // === Image Generation ===
    imageStyle: 'captured in cinematic composition, black and white with subtle muted color accents, painterly-realistic style, immersive ASMR atmosphere, soft textures and lighting, shallow depth of field, atmospheric details like dust, fog, smoke, or candlelight, realistic human figures in period-accurate attire, attention to tactile surfaces and small details, quiet intensity, no modern objects, ultra-detailed, dramatic shadows, evocative mood',
    negativePrompt: 'text, words, letters, numbers, labels, captions, titles, typography, modern objects, contemporary clothing, 3d render, vector, neon colors, watermark, deformed, border, frame, white border, margin, edges, vignette, cartoon, anime',

    // === Segmentation ===
    segmentationType: 'sentence',
    wordsPerSegment: 0, // Not used for sentence-based

    // === Captions ===
    captionsEnabled: true,
    minWordsPerCaption: 3,
    maxWordsPerCaption: 6,
    captionStyle: {
        ...DEFAULT_CAPTION_STYLE,
        useBox: false, // Outline style for non-highlighted words
    },
    highlightStyle: {
        ...DEFAULT_HIGHLIGHT_STYLE,
        enabled: false,
        color: '&H00FF008B', // Purple
        useBox: true,
    },

    // === Video Effects ===
    panEffect: false,

    // === LLM Context ===
    llmContext: `Cinematic black and white with subtle muted color accents, painterly-realistic ASMR aesthetic.

COMPOSITION: Dramatic framing with shallow depth of field. Focus on intimate details and tactile surfaces.
LIGHTING: Soft, atmospheric lighting with dramatic shadows. Use dust, fog, smoke, or candlelight for ambiance.
SUBJECTS: Realistic human figures in period-accurate attire. Attention to small details and quiet intensity.
CONSTRAINTS: No modern objects. Evocative mood with ultra-detailed textures.`,
};
