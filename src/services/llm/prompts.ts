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
      ? `DESCRIBE only the scene content (subject, action, setting, atmosphere). Do NOT include any style keywords - the visual style will be applied separately.
Pattern: [subject doing action in setting]. [atmosphere/lighting details].
Example: "a king standing in throne room, golden light streaming through stained glass windows, regal atmosphere."`
      : `OPTIMIZE for web image search. Use concrete, searchable noun phrases.`;



   const llmContext = style.llmContext || '';

   // --- FORMAT (output specification) ---
   const wordCount = useAiImage ? '20-50' : '8-15';

   // Shot types only for sentence-based segmentation (not wordCount)
   const useShotTypes = style.segmentationType === 'sentence';

   const outputSchema = useShotTypes
      ? `{"start": number, "end": number, "query": "string", "type": "pan"|"zoom"|"static", "linkedTo": number|null}`
      : `{"start": number, "end": number, "query": "string"}`;

   const shotTypeInstructions = useShotTypes
      ? `
CAMERA MOVEMENT (in the "type" field ONLY, never in query text):
- "pan" → camera glides across the scene. Use for: wide landscapes, establishing new locations, sweeping battlefields, environmental reveals, scenic vistas.
- "zoom" → camera moves in or out. Use for: dramatic emphasis, revealing key details, emotional close-ups, tension building, important objects.
- "static" → no camera movement. Use for: action sequences, character focus, dialogue moments, letting viewers absorb the scene.

VIDEO RETENTION (CRITICAL):
- FIRST 2 SEGMENTS: Must use "pan" or "zoom" - movement hooks viewers immediately!
- NEVER start the video with "static" - viewers will scroll away!
- AVOID consecutive static segments (2+ in a row = bad retention)
- After the first few segments, static is fine but space them out with movement

CONTENT-DRIVEN CHOICE:
Choose based on what the scene depicts, but respect the retention rules above.
- Multiple landscape reveals? Use "pan" repeatedly - great for retention!
- Building tension? "zoom" several times works well!
- Action sequence later in video? Static is fine when spaced out.

IMPORTANT: The type value goes ONLY in the "type" JSON field. Never put "pan", "zoom", or "static" in the query text.`
      : '';

   return `# PERSONA
${persona}

# TASK
${task}

# CONTEXT
## Style Keywords
${styleDirection}

## Creative Brief (Style-specific instructions - follow these if provided)
${llmContext}

## Query Format (Default - use unless Creative Brief specifies otherwise)
Structure queries naturally, weaving in these elements:
- WHO/WHAT: Be specific about the subject (e.g., "a determined young woman with dark braided hair" not just "woman")
- ACTION: What is happening in the scene
- SETTING: Where is this, environment details
- ATMOSPHERE: Lighting, mood, time of day

Keep it flowing as natural prose, not labeled sections.
${shotTypeInstructions}

Word count: ${wordCount} words per query.

## Continuity Workflow
BEFORE generating queries:
1. READ THE ENTIRE TRANSCRIPT FIRST to understand the overall topic, era, and theme
2. IDENTIFY the historical period, setting, or context (e.g., "This is about Vikings in 1066", "This is WWII in Europe", "This is ancient Rome")
3. SCAN all segments to identify recurring characters, locations, and themes
4. CREATE a mental reference card for each character (e.g., "the determined female sniper with dark braided hair in Soviet uniform")
5. IDENTIFY scene transitions vs. scene continuations

DURING generation:
- STAY CONTEXTUALLY ACCURATE: Only include objects, weapons, clothing, technology, and settings that authentically belong to the identified era, topic, or setting
- NEVER mix elements from different time periods or contexts (e.g., no modern items in historical scenes, no anachronistic technology)
- MAINTAIN VISUAL CONSISTENCY: All scenes should feel like they belong to the same video
  - Use a consistent color palette and lighting mood throughout (e.g., if the video starts with warm golden tones, maintain that warmth)
  - Keep the same visual tone and atmosphere across all segments
  - Describe environments with similar levels of detail and complexity
- REUSE the exact same description phrase every time a character reappears
- For scene continuations: maintain consistent setting, lighting, and environment details
- For scene transitions: establish the new location clearly but maintain the overall visual style

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
   const wordCount = useAiImage ? '20-50' : '8-15';

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
