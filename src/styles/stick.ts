/**
 * Stick style configuration
 * Minimalist white line stick figures on black background
 * Uses only visual symbols - no text in generated images
 * Consistent character design with round heads and dot eyes
 */

import type { VideoStyle } from "./types.ts";

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
    imageStyle: "cartoon stick figure, round circle head with dot eyes and curved mouth, white lines on pure black background, consistent line weight, simple expressive faces, focus on expression and pose, no text, 2D flat, high contrast",
    negativePrompt: "3d render, realistic, color, shading, texture, watermark, text, words, letters, writing, labels, captions, detailed hands, fingers, realistic faces",

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
    },
    highlightStyle: {
        enabled: false,
        color: "&H0000FFFF",  // Yellow highlight
        useBox: true,
    },

    // === Video Effects ===
    panEffect: false,  // Static images work better for stick figures

    // === Multi-Image Segmentation ===
    multiImageSegments: true,  // Enable multi-image for longer sentences
    multiImageThreshold: 12,   // Split sentences with >12 words

    // === LLM Context ===
    llmContext: `You are generating image prompts for cartoon stick figure illustrations with CONSISTENT character design.

=== CHARACTER ANATOMY (MUST BE CONSISTENT IN EVERY PROMPT) ===
Every stick figure MUST have these exact features:
- ROUND CIRCLE HEAD (perfect circle, not oval)
- DOT EYES (two small filled black dots)
- CURVED LINE MOUTH (simple curve: smile ⌣, frown ⌢, or wavy ~ for confusion)
- THIN WHITE LINE BODY (single stroke torso)
- STICK LIMBS (simple lines for arms and legs)
- ROUND ENDPOINTS for hands (small circles, no fingers)
- Optional: simple hair lines (spiky, ponytail, etc.)

=== FACIAL EXPRESSIONS (USE THESE EXACT DESCRIPTIONS) ===
- HAPPY: "round head with dot eyes and curved smile mouth"
- SAD: "round head with dot eyes and downturned frown mouth"
- EXCITED: "round head with wide dot eyes and big open smile"
- CONFUSED: "round head with dot eyes and wavy squiggle mouth"
- ANGRY: "round head with angled dot eyes and downturned mouth"
- SURPRISED: "round head with wide dot eyes and small O mouth"
- WORRIED: "round head with dot eyes and small frown, raised eyebrow lines"

=== CRITICAL RULES ===
1. NO TEXT in images - never include words, labels, letters, or writing
2. Use VISUAL SYMBOLS instead of text:
   - Speech bubbles with icons (!, ?, ❤, 💡, ⚡) 
   - Signs with arrows or simple icons
   - Thought bubbles with symbol images
3. EVERY character must match the anatomy template above
4. Use consistent line weight throughout

=== PROMPT STRUCTURE (MUST FOLLOW) ===
[Character with anatomy] + [Facial expression] + [Body pose] + [Visual symbols] + [Setting] + [Style keywords]

=== BODY POSES ===
- Standing: "stick figure standing straight"
- Pointing: "arm extended pointing with round hand endpoint"
- Jumping: "arms raised, legs bent in jump pose"
- Sitting: "bent at waist, stick legs forward"
- Walking: "legs in stride, arms swinging"
- Scratching head: "one arm bent with round hand touching head"

=== VISUAL SYMBOLS (USE INSTEAD OF TEXT) ===
- Signpost with arrow icon pointing direction
- Speech bubble with exclamation mark (!)
- Speech bubble with question mark (?)
- Thought bubble with lightbulb icon
- Heart symbols floating
- Star symbols for emphasis
- Sweat drops for nervousness
- Motion lines for movement

=== SETTING ===
- Pure black background
- Minimal white line props only
- Simple geometric shapes for environment

=== STYLE KEYWORDS (ALWAYS END WITH) ===
"cartoon stick figure, round head with dot eyes, white lines on pure black background, consistent line weight, simple expressive face, no text, icons only, 2D flat, high contrast"

=== EXAMPLE PROMPTS ===
- "cartoon stick figure with round circle head dot eyes and big curved smile mouth, spiky hair lines, arms raised triumphantly in jump pose with round hand endpoints, signpost with arrow icon nearby, pure black background, cartoon stick figure, round head with dot eyes, white lines on pure black background, consistent line weight, simple expressive face, no text, icons only, 2D flat, high contrast"

- "cartoon stick figure with round head dot eyes and wavy confused mouth scratching head with round hand endpoint, looking at signpost with arrow icon, second stick figure with round head dot eyes and curved smile pointing with extended arm, pure black background, cartoon stick figure, round head with dot eyes, white lines on pure black background, consistent line weight, simple expressive face, no text, icons only, 2D flat, high contrast"

- "cartoon stick figure with round head dot eyes and downturned sad frown mouth, slumped shoulders drooping posture, rain cloud icon with droplets above head, pure black background, cartoon stick figure, round head with dot eyes, white lines on pure black background, consistent line weight, simple expressive face, no text, icons only, 2D flat, high contrast"

- "cartoon stick figure with round head wide dot eyes and excited open smile, ponytail hair lines, leaning forward eagerly with round hand endpoints clasped together, heart symbols floating nearby, pure black background, cartoon stick figure, round head with dot eyes, white lines on pure black background, consistent line weight, simple expressive face, no text, icons only, 2D flat, high contrast"

- "two cartoon stick figures with round heads and dot eyes, first one with curved smile pointing at whiteboard with chart icon, second one with small O surprised mouth taking notes, simple desk shapes, pure black background, cartoon stick figure, round head with dot eyes, white lines on pure black background, consistent line weight, simple expressive face, no text, icons only, 2D flat, high contrast"`,
};
