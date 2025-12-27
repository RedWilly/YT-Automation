/**
 * LLM Prompt templates using the 4-Pillar approach:
 * Persona, Task, Context, Format
 * 
 * Enhanced with Runway Gen-4 keyword categories and Gemini command language
 */

import type { ResolvedStyle } from '../../styles/types.ts';

/**
 * Build system prompt for the LLM with style-specific context
 * Applies Gemini prompting guide: Persona + Task + Context + Format
 */
export function buildSystemPrompt(useAiImage: boolean, style: ResolvedStyle): string {
   // --- PERSONA (who is the AI?) ---
   const persona = `You are a senior visual storyboard artist and cinematographer. You specialize in translating spoken narratives into cinematic image descriptions optimized for AI generation.`;

   // --- TASK (what must be done?) ---
   const task = `ANALYZE the transcript segment-by-segment. GENERATE one vivid image description per segment. ENSURE visual narrative continuity across all images.`;

   // --- CONTEXT (background + constraints) ---
   const styleDirection = useAiImage
      ? `BLEND style keywords naturally into every query: "${style.imageStyle}"
Pattern: [Style prefix] of [subject doing action in setting]. [Style modifiers].
Example: "gouache watercolor illustration of a king standing in throne room. soft blended colors, atmospheric lighting, painterly textures."`
      : `OPTIMIZE for web image search. Use concrete, searchable noun phrases.`;

   const forbidden = useAiImage && style.negativePrompt
      ? `REJECT these elements (never include): ${style.negativePrompt}`
      : '';

   const llmContext = style.llmContext || '';

   // --- FORMAT (output specification) ---
   const wordCount = useAiImage ? '40-70' : '8-15';

   const outputSchema = style.naturalEdit
      ? `{"start": number, "end": number, "query": "string", "type": "pan"|"zoom"|"static"}`
      : `{"start": number, "end": number, "query": "string"}`;

   const shotTypeInstructions = style.naturalEdit
      ? `
ASSIGN shot type for visual rhythm:
- "pan" → establishing shots, wide scenes, new locations
- "zoom" → close-ups, details, emphasis, specific facts
- "static" → main action, dialogue, primary subject
VARY types: never repeat the same type 3+ times consecutively.`
      : '';

   return `# PERSONA
${persona}

# TASK
${task}

# CONTEXT
## Style Keywords
${styleDirection}
${forbidden}

## Creative Brief
${llmContext}

## Query Structure (Runway Gen-4 Categories)
INCLUDE these elements in every query:
- SUBJECT: Who/what is the focus? Be specific (e.g., "weathered fisherman" not "man")
- ACTION: What is happening? Use active verbs
- SETTING: Where is this? Include environment details
- LIGHTING: Describe the light quality (e.g., "golden hour", "dramatic shadows")
- COMPOSITION: Frame the shot (e.g., "medium shot", "centered", "rule of thirds")
${shotTypeInstructions}

Word count: ${wordCount} words per query.

## Critical Rules
1. PRESERVE timestamps exactly (copy start/end values unchanged)
2. NEVER include text, words, letters, numbers, or labels in visual descriptions
3. MAINTAIN consistency: same character = identical description phrase, same location = identical phrase
4. REPLACE text concepts with visual symbols (e.g., "$500" → "stack of money with dollar symbol icon")
5. ENSURE visual continuity: consecutive segments in same scene should flow naturally

# FORMAT
RETURN only a valid JSON array. No markdown, no preamble, no explanations.
Schema: ${outputSchema}`;
}

/**
 * Build user prompt with the transcript
 */
export function buildUserPrompt(
   formattedTranscript: string,
   segmentCount: number,
   useAiImage: boolean,
   naturalEdit: boolean = false
): string {
   const wordCount = useAiImage ? '40-70' : '8-15';

   const typeField = naturalEdit
      ? `- INCLUDE "type" field: "pan", "zoom", or "static"`
      : '';

   const outputExample = naturalEdit
      ? `[{"start": 0, "end": 5000, "query": "...", "type": "pan"}, ...]`
      : `[{"start": 0, "end": 5000, "query": "..."}, ...]`;

   return `# TRANSCRIPT (${segmentCount} segments)
${formattedTranscript}

# EXECUTE
1. IDENTIFY recurring characters, locations, and themes
2. GENERATE exactly ${segmentCount} queries
3. USE ${wordCount} words per query
4. COPY exact timestamps from segments
${typeField}

# OUTPUT
JSON array only:
${outputExample}`;
}
