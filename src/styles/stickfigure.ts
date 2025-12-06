/**
 * Stick Figure style configuration
 * Minimalist black-and-white stick figure illustrations
 */

import type { VideoStyle } from "./types.ts";

/**
 * Stick Figure style - Simple, expressive illustrations
 * 
 * Features:
 * - Sentence-based segmentation (natural speech breaks)
 * - Minimalist stick figure aesthetic
 * - Black lines on white background
 * - Focus on expression and pose
 * - Karaoke captions enabled
 */
export const stickfigureStyle: VideoStyle = {
    id: "stickfigure",
    name: "Stick Figure",
    description: "Minimalist stick figure illustrations with expressive poses",

    // === Image Generation ===
    imageStyle: "simple stick figure style, black lines on white background, minimal detail, focus on expression and pose, 2D flat",
    negativePrompt: "realistic, photorealistic, 3d, detailed, complex, colorful, shading, gradient, shadow, texture, photograph",

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
    },
    highlightStyle: {
        enabled: true,
        color: "&H000000FF",  // Red highlight
        useBox: true,
    },

    // === Video Effects ===
    panEffect: false,  // Static images work better for stick figures
    zoomToFit: true,   // Scale to fill 1920x1080 (crop edges if needed)

    // === LLM Context ===
    llmContext: `You are generating image prompts for stick figure illustrations.

PROMPT STRUCTURE (MUST FOLLOW):
[Character Visual Base] + [Specific Action] + [Setting] + [Detail] + [Style Keywords]

CHARACTER VISUAL BASE:
- Always start with a clear character description (e.g., "stick figure person", "stick figure woman with ponytail", "stick figure businessman with tie")
- Include distinguishing features when relevant (hair, accessories, props)

SPECIFIC ACTION:
- Describe what the character is doing with clear body language
- Focus on pose and expression (e.g., "jumping with arms raised", "slumped over desk looking tired")

SETTING:
- Keep backgrounds minimal but clear (e.g., "at office desk", "on mountain peak", "in kitchen")

DETAIL:
- Add one or two key props or environmental elements
- Keep it simple - stick figures work best with minimal clutter

STYLE KEYWORDS (ALWAYS END WITH):
- Always include: "simple stick figure style, black lines on white background, minimal detail, 2D flat"

EXAMPLE PROMPTS:
- "stick figure person with spiky hair, running fast with motion lines, on a track field, finish line ahead, simple stick figure style, black lines on white background, minimal detail, 2D flat"
- "stick figure woman with long hair, sitting at desk typing on laptop, small office setting, coffee cup nearby, simple stick figure style, black lines on white background, minimal detail, 2D flat"
- "stick figure man in chef hat, stirring large pot enthusiastically, kitchen background, steam rising, simple stick figure style, black lines on white background, minimal detail, 2D flat"`,
};
