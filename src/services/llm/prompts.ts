/**
 * LLM Prompt templates and generation logic
 * Supports natural editing mode with shot type effects
 */

import type { ResolvedStyle } from "../../styles/types.ts";

/**
 * Build system prompt for the LLM with style-specific context
 * @param useAiImage - Whether AI image generation is enabled
 * @param style - Resolved style configuration with LLM context
 * @returns System prompt string
 */
export function buildSystemPrompt(useAiImage: boolean, style: ResolvedStyle): string {
   // Word count based on image source
   const wordCount = useAiImage
      ? "35-60 words (detailed for AI generation)"
      : "8-15 words (concise for web search)";

   // Style guidance based on image source
   const styleGuidance = useAiImage
      ? `IMAGE STYLE KEYWORDS: "${style.imageStyle}"

IMPORTANT: You MUST include the style keywords at the END of each query.
Your job: Describe the SCENE (who, doing what, where, with what details) + ADD style keywords at the end.
The style keywords ensure visual consistency across all generated images.`
      : `IMAGE SOURCE: Web search (DuckDuckGo)
Use concrete, searchable terms. Avoid abstract or artistic language.`;

   // Add style-specific LLM context if available
   const styleContext = style.llmContext
      ? `\n## STYLE-SPECIFIC GUIDANCE\n${style.llmContext}\n`
      : "";

   // Natural editing shot type instructions
   const naturalEditInstructions = style.naturalEdit
      ? `
## SHOT TYPES (Natural Editing Mode)
For each segment, assign a shot type to create visual variety:

- **"pan"** - For establishing shots, wide scenes, or when panning movement would enhance the visual
- **"zoom"** - For close-ups, details, specific facts, or moments needing focus
- **"static"** - For primary actions, dialogue, or when the subject should be clearly visible without movement

Your output MUST include: {"start": N, "end": N, "query": "...", "type": "pan|zoom|static"}

SHOT TYPE GUIDELINES:
1. Opening segments: use "pan" to establish the scene
2. Specific details, numbers, close-ups: use "zoom"
3. Main action or primary subject: use "static"
4. Vary types for rhythm - don't use the same type 3+ times in a row
5. Scene transitions: consider "pan" for new locations
`
      : "";

   const outputFormat = style.naturalEdit
      ? `Each object: {"start": number, "end": number, "query": "string", "type": "pan"|"zoom"|"static"}`
      : `Each object: {"start": number, "end": number, "query": "string"}`;

   return `You are a visual query generator for video content.

${styleGuidance}
${styleContext}${naturalEditInstructions}
## YOUR OUTPUT FORMAT
Return ONLY a valid JSON array. No text before or after.
Copy "start" and "end" exactly from the transcript segments; do not modify them.
${outputFormat}

## QUERY REQUIREMENTS
Every query MUST follow this structure:
[WHO] + [ACTION] + [WHERE/CONTEXT] + [DETAILS]

Word count: ${wordCount}

✅ CORRECT: "Japanese pilot standing on aircraft carrier deck observing incoming fighter planes in the Pacific ocean during World War 2"
✅ CORRECT: "Dr. Sarah Chen presenting climate research at conference podium in Geneva showing data charts to audience"
✅ CORRECT: "scientist in white lab coat examining water samples under microscope in modern research laboratory"

❌ WRONG: "aircraft carrier deck" (missing WHO and ACTION)
❌ WRONG: "conference podium" (missing WHO and ACTION)
❌ WRONG: "laboratory equipment" (missing WHO and ACTION)

## CONSISTENCY RULES (CRITICAL)
Before generating, identify these elements and REUSE them consistently:

1. **CHARACTERS**: If "Dr. Smith" appears in segments 1, 4, 7 → use "Dr. Smith" in ALL those queries
   - Do NOT switch between "scientist", "researcher", "doctor" for the same person

2. **LOCATIONS**: If segments 2-5 happen in "research laboratory" → use same location phrase
   - Do NOT switch between "lab", "laboratory", "research facility" randomly

3. **CONTEXT**: If the transcript is about WW2 aviation → maintain that context throughout
   - Do NOT randomly change time periods or themes

4. **FLOW**: Consecutive segments in same scene should have visual continuity
   - Only change settings when the transcript explicitly indicates a scene change

## PROCESS
1. Read ALL segments first
2. List recurring: characters, locations, themes
3. Generate queries using CONSISTENT descriptors for each element
4. Verify: same person = same words, same place = same words`;
}

/**
 * User prompt for image query generation
 * @param formattedTranscript - Formatted transcript with timestamps
 * @param segmentCount - Number of segments
 * @param useAiImage - Whether AI image generation is enabled
 * @param naturalEdit - Whether natural editing mode is active
 */
export function buildUserPrompt(
   formattedTranscript: string,
   segmentCount: number,
   useAiImage: boolean,
   naturalEdit: boolean = false
): string {
   const wordCount = useAiImage ? "35-60" : "8-15";

   const shotTypeReminder = naturalEdit
      ? `
## SHOT TYPES REMINDER
Each query MUST include a "type" field: "pan", "zoom", or "static"
- "pan" → establishing shots, wide scenes, panning moments
- "zoom" → close-ups, details, focus moments
- "static" → main action, clear subjects, dialogue
`
      : "";

   const outputExample = naturalEdit
      ? `[{"start": 0, "end": 5000, "query": "...", "type": "pan"}, ...]`
      : `[{"start": 0, "end": 5000, "query": "..."}, ...]`;

   return `## TRANSCRIPT (${segmentCount} segments)
${formattedTranscript}
${shotTypeReminder}
## STEP 1: IDENTIFY RECURRING ELEMENTS
Before generating queries, list in your mind:
- Characters: Who appears? (names, titles, roles)
- Locations: Where does it happen? (places, settings)
- Theme: What is the overall topic?

## STEP 2: GENERATE ${segmentCount} QUERIES
For each segment, create one query following this format:
[WHO] + [ACTION] + [WHERE] + [DETAILS]

Requirements:
- Word count: ${wordCount} words per query
- Use EXACT timestamps from segments
- Same person = same descriptor throughout
- Same location = same descriptor throughout
${naturalEdit ? "- Include \"type\" field for each query (vertical/zoom/static)" : ""}

## OUTPUT
Return ONLY a JSON array with ${segmentCount} objects:
${outputExample}

No text before or after the JSON. No markdown. No explanations.`;
}
