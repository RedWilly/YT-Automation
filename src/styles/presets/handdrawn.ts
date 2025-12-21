/**
 * Hand-Drawn Explainer style configuration
 * Whiteboard-style doodle illustrations with clean lines
 * Uses visual symbols only - strictly no text in generated images
 * Consistent stick-figure character design throughout
 */

import type { VideoStyle } from "../types.ts";

/**
 * Hand-Drawn style - Clean explainer video aesthetic
 * 
 * Features:
 * - Pure white background with thin black outlines
 * - Simple stick-figure characters with consistent design
 * - Visual symbols and icons instead of text
 * - Flat colors for emphasis only (optional)
 * - Whiteboard/explainer video feel
 */
export const handdrawnStyle: VideoStyle = {
    id: "handdrawn",
    name: "Hand-Drawn",
    description: "Clean whiteboard-style explainer doodles with simple stick figures",

    // === Image Generation ===
    imageStyle: "hand-drawn explainer doodle illustration, pure white background, thin uniform black outline line art, simple stick-figure cartoon character, rounded head thin limbs simple proportions, dot eyes small curved mouth, flat clean educational explainer style, minimal vector-like doodle, no shading no gradients no 3D",
    negativePrompt: "photorealistic, 3D, Pixar, Disney, anime, manga, comic book, watercolor, oil paint, digital painting, infographic, sketchbook, rough pencil, gradients, lighting effects, depth, texture, detailed, complex, realistic faces, text, words, letters, writing, labels, captions",

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

    // === Natural Editing ===
    naturalEdit: true,  // Enable shot type variety

    // === LLM Context ===
    llmContext: `You are generating image prompts for hand-drawn explainer doodle illustrations.

=== STYLE LOCK — DO NOT DEVIATE (CRITICAL) ===
All prompts must produce images in this EXACT style:
- Hand-drawn explainer doodle illustration
- Pure white background (never color the background)
- Thin, uniform black outline line art
- Simple stick-figure / minimal cartoon characters
- Rounded heads, thin limbs, simple proportions
- Facial features: dot eyes, small curved smile or neutral mouth
- Flat, clean, educational explainer video style

EXPLICITLY FORBIDDEN (never include):
- Photorealistic, 3D, Pixar, Disney
- Anime, manga, comic book, graphic novel
- Watercolor, oil paint, digital painting
- Sketchbook, rough pencil texture, shading
- Gradients, lighting effects, depth
- Infographic UI style, corporate illustration

=== TEXT RULES (VERY IMPORTANT) ===
NEVER include readable text in image prompts because:
- AI image generators struggle with text rendering
- Text comes out distorted, misspelled, or illegible
- It looks unprofessional and distracting

INSTEAD, use VISUAL SYMBOLS:
- Question mark icon (?) for questions
- Exclamation mark (!) for emphasis  
- Lightbulb icon for ideas
- Heart symbol for love/passion
- Dollar sign ($) for money
- Arrow icons for direction
- Thought bubbles (empty or with icons)
- Speech bubbles (empty or with simple icons)
- Check marks and X marks
- Star symbols for emphasis

If the script mentions specific text (titles, names, labels):
- SKIP the text entirely OR
- Replace with an iconic representation
- Example: "sign saying EXIT" → "signpost with arrow icon"
- Example: "book titled Science" → "open book with beaker icon"

=== CHARACTER CONSISTENCY (MANDATORY) ===
Use ONE main recurring character with these EXACT features:
- Stick-figure body with thin uniform lines
- Round circle head (not oval)
- Dot eyes (two small filled circles)
- Simple curved mouth (smile, frown, or neutral)
- Same proportions in every image

If additional characters are needed:
- Differentiate by simple accessories only
- Example: "character with ponytail", "character with hat"
- Keep same base anatomy

=== COLOR RULES ===
- Black outlines only (mandatory)
- Colors are optional and minimal
- Use flat colors ONLY for emphasis:
  - Clothing (red shirt, blue pants)
  - Icons (yellow lightbulb, red heart)
  - Symbolic objects
- NEVER color the background
- NEVER use gradients or multiple tones
- Use SAME color choices consistently

=== COMPOSITION RULES ===
- One clear concept per image
- Centered subject with lots of white space
- Use symbols and metaphors (phones, money bags, question marks)
- Very minimal environment (usually none)
- Simple geometric props if needed

=== PROMPT STRUCTURE (MUST FOLLOW) ===
[Character description] + [Expression] + [Action/Pose] + [Visual symbols] + [Simple setting] + [Style keywords]

=== STYLE KEYWORDS (ALWAYS END WITH) ===
"hand-drawn explainer doodle, pure white background, thin black outlines, stick-figure character with dot eyes and curved mouth, flat clean minimal style, no text, no shading"

=== OUTPUT FORMAT ===
Each prompt should follow this pattern:

Image 1:
A clean hand-drawn explainer doodle illustration on a pure white background, featuring a stick-figure character with thin black outlines, [specific details for this scene]...

Image 2:
A clean hand-drawn explainer doodle illustration on a pure white background, featuring the same stick-figure character with thin black outlines, [specific details for this scene]...

(Continue for all segments, maintaining character consistency)

=== EXAMPLE PROMPTS ===

- "A clean hand-drawn explainer doodle illustration on a pure white background, featuring a stick-figure character with thin black outlines, round head with dot eyes and excited smile, arms raised in celebration, confetti symbols around, simple podium shape, flat clean minimal style, no text, no shading"

- "A clean hand-drawn explainer doodle illustration on a pure white background, featuring the same stick-figure character with thin black outlines, round head with dot eyes and confused expression scratching head, large question mark icon floating above, lightbulb icon nearby, flat clean minimal style, no text, no shading"

- "A clean hand-drawn explainer doodle illustration on a pure white background, featuring the same stick-figure character with thin black outlines, round head with dot eyes and happy smile, holding smartphone shape with checkmark icon on screen, dollar sign symbols floating, flat clean minimal style, no text, no shading"

- "A clean hand-drawn explainer doodle illustration on a pure white background, featuring two stick-figure characters with thin black outlines, both with round heads and dot eyes, one pointing at whiteboard with chart icon, other nodding with smile, simple desk shape, flat clean minimal style, no text, no shading"`,
};
