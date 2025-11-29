/**
 * LLM Prompt templates and generation logic
 */

/**
 * Build system prompt for the LLM with conditional AI style integration
 * @param useAiImage - Whether AI image generation is enabled
 * @param aiImageStyle - The AI image style to use (only if useAiImage is true)
 * @returns System prompt string
 */
export function buildSystemPrompt(useAiImage: boolean, aiImageStyle: string): string {
   // Word count based on image source
   const wordCount = useAiImage
      ? "20-35 words (detailed for AI generation)"
      : "8-15 words (concise for web search)";

   // Style guidance based on image source
   const styleGuidance = useAiImage
      ? `IMAGE STYLE: "${aiImageStyle}"
Do NOT write this style in your queries. The system adds it automatically.
Your job: Describe the SCENE (who, doing what, where, with what details).`
      : `IMAGE SOURCE: Web search (DuckDuckGo)
Use concrete, searchable terms. Avoid abstract or artistic language.`;

   return `You are a visual query generator for video content.

${styleGuidance}

## YOUR OUTPUT FORMAT
Return ONLY a valid JSON array. No text before or after.
Each object: {"start": number, "end": number, "query": "string"}

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
 * Provides the transcript and reinforces key rules
 */
export function buildUserPrompt(
   formattedTranscript: string,
   segmentCount: number,
   useAiImage: boolean
): string {
   const wordCount = useAiImage ? "20-35" : "8-15";

   return `## TRANSCRIPT (${segmentCount} segments)
${formattedTranscript}

## STEP 1: IDENTIFY RECURRING ELEMENTS
Before generating queries, list in your mind:
- Characters: Who appears? (names, titles, roles)
- Locations: Where does it happen? (places, settings)
- Theme: What is the overall topic?

## STEP 2: GENERATE ${segmentCount} QUERIES
For each segment, create ONE query following this format:
[WHO] + [ACTION] + [WHERE] + [DETAILS]

Requirements:
- Word count: ${wordCount} words per query
- Use EXACT timestamps from segments
- Same person = same descriptor throughout
- Same location = same descriptor throughout

## OUTPUT
Return ONLY a JSON array with ${segmentCount} objects:
[{"start": 0, "end": 5000, "query": "..."}, ...]

No text before or after the JSON. No markdown. No explanations.`;
}
