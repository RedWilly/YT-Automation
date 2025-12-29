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

   // Shot types only for sentence-based segmentation (not wordCount)
   const useShotTypes = style.segmentationType === 'sentence';

   const outputSchema = useShotTypes
      ? `{"start": number, "end": number, "query": "string", "type": "pan"|"zoom"|"static", "linkedTo": number|null}`
      : `{"start": number, "end": number, "query": "string"}`;

   const shotTypeInstructions = useShotTypes
      ? `
CAMERA MOVEMENT (in the "type" field ONLY, never in query text):
- "pan" → camera moves across the scene. Direction auto-selected based on video format: horizontal (16:9) pans up/down, vertical (9:16 shorts) pans left/right. Great for: establishing shots, wide landscapes, environments, revealing new locations, sweeping vistas.
- "zoom" → camera moves into or out of scene (direction auto-selected: in or out). Great for: emphasizing details, dramatic reveals, focusing on specific elements, emotional beats.
- "static" → still image, no camera movement. Equally powerful as motion types. Great for: dialogue, main action, intimate moments, letting the viewer absorb the scene.

All three types work together to create visual rhythm. Choose based on what the content needs - the system handles the rest.
IMPORTANT: The type value goes ONLY in the "type" JSON field. Do NOT include "pan", "zoom", or "static" anywhere in the query text.`
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
- COMPOSITION: Compose the shot (e.g., "medium shot", "centered", "rule of thirds")
${shotTypeInstructions}

Word count: ${wordCount} words per query.

## Continuity Workflow
BEFORE generating queries:
1. SCAN all segments to identify recurring characters, locations, and themes
2. CREATE a mental reference card for each character (e.g., "the determined female sniper with dark braided hair in Soviet uniform")
3. IDENTIFY scene transitions vs. scene continuations

DURING generation:
- REUSE the exact same description phrase every time a character reappears
- For scene continuations: maintain consistent setting, lighting, and environment details
- For scene transitions: establish the new location clearly before focusing on action

## Scene Linking (linkedTo field)
The "linkedTo" field connects related segments for visual consistency. Set it to the INDEX (array position, starting from 0) of the MOST RELEVANT previous segment, or null if this is a new/unrelated scene.

LINK when:
- Same character appears in both segments
- Scene continues in same location
- Direct cause-and-effect relationship

DO NOT link when:
- New location or setting
- Different characters entirely
- Time skip in narrative

Constraints:
- Only reference EARLIER segments (lower indices)
- Link to ONE segment only (the most relevant)
- First segment (index 0) must have linkedTo: null

## Critical Rules
1. PRESERVE timestamps exactly (copy start/end values unchanged)
2. NEVER include text, words, letters, numbers, or labels in visual descriptions
3. REPLACE text concepts with visual symbols (e.g., "$500" → "stack of money with dollar symbol icon")
4. FULL-SCENE COMPOSITION: Write queries that imply edge-to-edge imagery. Avoid words like "panel", "frame", "border", "margin". Describe scenes that naturally fill the entire view or As a scene.

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
      ? `- INCLUDE "type" field: "pan", "zoom", or "static"
- INCLUDE "linkedTo" field: index of related previous segment, or null`
      : '';

   const outputExample = naturalEdit
      ? `[{"start": 0, "end": 5000, "query": "...", "type": "pan", "linkedTo": null}, {"start": 5001, "end": 10000, "query": "...", "type": "zoom", "linkedTo": 0}, ...]`
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
