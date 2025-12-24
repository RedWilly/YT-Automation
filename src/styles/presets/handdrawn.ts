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
    imageStyle: "hand-drawn explainer doodle illustration, very pale pastel yellow background, thin uniform black outline line art, simple stick-figure cartoon character, rounded head thin limbs simple proportions, dot eyes small curved mouth, flat clean educational explainer style, minimal vector-like doodle, no shading no gradients no 3D, absolutely no text no words no letters no writing",
    negativePrompt: "text, words, letters, writing, labels, captions, titles, numbers, alphabet, typography, font, photorealistic, 3D, Pixar, Disney, anime, manga, comic book, watercolor, oil paint, digital painting, infographic, sketchbook, rough pencil, gradients, lighting effects, depth, texture, detailed, complex, realistic faces, white background",

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

=== ABSOLUTE TEXT BAN (CRITICAL - READ THIS FIRST) ===
🚫 ABSOLUTELY NO TEXT IN ANY IMAGE PROMPT 🚫

DO NOT include ANY of the following in your prompts:
- Words, letters, alphabets, numbers
- Signs with readable text
- Labels, titles, captions
- Book covers with titles
- Screens with text
- Clocks with numbers (use clock hands only)
- Calendars with text (use calendar icon with page-flip motion only)
- Any readable writing whatsoever

WHY: AI image generators CANNOT render text properly. It always comes out:
- Misspelled
- Distorted
- Illegible
- Unprofessional

INSTEAD, use ONLY visual symbols:
- ❓ Question mark icon (floating, not on sign)
- ❗ Exclamation mark icon
- 💡 Lightbulb icon (for ideas)
- ❤️ Heart symbol
- 💲 Dollar sign symbol
- ➡️ Arrow icons
- 💭 Empty thought bubbles
- 💬 Empty speech bubbles
- ✓ Check mark, ✗ X mark
- ⭐ Star symbols
- 🕐 Clock icon with hands only (NO numbers)
- 📅 Calendar icon with flipping pages (NO text)

CONVERSION EXAMPLES:
❌ "sign saying EXIT" → ✅ "signpost with arrow icon pointing right"
❌ "book titled Science" → ✅ "open book with beaker icon on cover"
❌ "clock showing 3pm" → ✅ "clock icon with hour hand pointing"
❌ "calendar showing deadline" → ✅ "calendar icon with pages flipping animation style"
❌ "screen with message" → ✅ "screen shape with checkmark icon"
❌ "watching a clock where the hour hand moves" → ✅ "looking at hourglass icon with sand flowing"

=== BACKGROUND COLOR (UNIQUE STYLE) ===
All images must have: VERY PALE PASTEL YELLOW background
- Not white (too common/cliche)
- Not bright yellow (too intense)
- Soft, warm, pale cream-yellow tone
- Consistent across ALL images

=== STYLE LOCK — DO NOT DEVIATE ===
All prompts must produce images in this EXACT style:
- Hand-drawn explainer doodle illustration
- Very pale pastel yellow background
- Thin, uniform black outline line art
- Simple stick-figure / minimal cartoon characters
- Rounded heads, thin limbs, simple proportions
- Facial features: dot eyes, small curved smile or neutral mouth
- Flat, clean, educational explainer video style

EXPLICITLY FORBIDDEN:
- Photorealistic, 3D, Pixar, Disney
- Anime, manga, comic book, graphic novel
- Watercolor, oil paint, digital painting
- Sketchbook, rough pencil texture, shading
- Gradients, lighting effects, depth
- ANY TEXT, WORDS, LETTERS, NUMBERS

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
- Very pale pastel yellow background (mandatory)
- Black outlines only (mandatory)
- Flat colors ONLY for emphasis:
  - Clothing (red shirt, blue pants)
  - Icons (yellow lightbulb, red heart)
- NEVER use gradients or multiple tones
- Use SAME color choices consistently

=== COMPOSITION RULES ===
- One clear concept per image
- Centered subject with ample space
- Use symbols and metaphors (icons, not text)
- Very minimal environment (usually none)
- Simple geometric props if needed

=== STYLE KEYWORDS (ALWAYS END EVERY PROMPT WITH) ===
"hand-drawn explainer doodle, very pale pastel yellow background, thin black outlines, stick-figure character with dot eyes, flat clean minimal style, absolutely no text no words no letters, no shading"

=== OUTPUT FORMAT ===
Each prompt should follow this pattern:

Image 1:
A clean hand-drawn explainer doodle illustration on a very pale pastel yellow background, featuring a stick-figure character with thin black outlines, [specific details], absolutely no text no words no letters, no shading

Image 2:
A clean hand-drawn explainer doodle illustration on a very pale pastel yellow background, featuring the same stick-figure character with thin black outlines, [specific details], absolutely no text no words no letters, no shading

=== EXAMPLE PROMPTS ===

Image 1:
A clean hand-drawn explainer doodle illustration on a very pale pastel yellow background, featuring a stick-figure character with thin black outlines, round head with dot eyes and excited smile, arms raised in celebration, confetti symbols around, simple podium shape, flat clean minimal style, absolutely no text no words no letters, no shading

Image 2:
A clean hand-drawn explainer doodle illustration on a very pale pastel yellow background, featuring the same stick-figure character with thin black outlines, round head with dot eyes and confused expression scratching head, large question mark icon floating above, lightbulb icon nearby, flat clean minimal style, absolutely no text no words no letters, no shading

Image 3:
A clean hand-drawn explainer doodle illustration on a very pale pastel yellow background, featuring the same stick-figure character with thin black outlines, round head with dot eyes looking sad, sitting slumped, hourglass icon with sand flowing beside character, calendar icon with pages flipping, flat clean minimal style, absolutely no text no words no letters, no shading

Image 4:
A clean hand-drawn explainer doodle illustration on a very pale pastel yellow background, featuring two stick-figure characters with thin black outlines, both with round heads and dot eyes, one pointing at whiteboard with chart line icon, other nodding with smile, simple desk shape, flat clean minimal style, absolutely no text no words no letters, no shading`,
};
