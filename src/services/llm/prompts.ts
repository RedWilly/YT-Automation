/**
 * LLM Prompt templates using the 4-Pillar approach:
 * Persona, Task, Context, Format
 * 
 * Enhanced with entity-aware context injection for consistency
 */

import type { ResolvedStyle } from '../../styles/types.ts';
import type { StoryContext, BatchState } from './context.ts';
import { buildContextInjection } from './context.ts';

/**
 * Build context-aware system prompt for Phase 2 query generation
 * Includes entity definitions from extracted StoryContext
 */
export function buildContextAwareSystemPrompt(
   useAiImage: boolean,
   style: ResolvedStyle,
   storyContext: StoryContext
): string {
   // --- PERSONA ---
   const persona = `You are a senior visual storyboard artist creating a cohesive visual narrative. You have been provided with a detailed entity registry and scene information to ensure perfect consistency.`;

   // --- TASK ---
   const task = `GENERATE one vivid image description per segment using the EXACT entity descriptions provided. Ensure all images feel like they belong to the same video.`;

   // --- CONTEXT: STORY OVERVIEW ---
   const storyOverview = `STORY OVERVIEW:
- Summary: ${storyContext.summary || 'Not specified'}
- Era/Setting: ${storyContext.era || 'Not specified'} - ${storyContext.primarySetting || 'Various locations'}
- Tone: ${storyContext.tone || 'Not specified'}`;

   // --- CONTEXT: STYLE ---
   const styleDirection = useAiImage
      ? `DESCRIBE only the scene content. Do NOT include style keywords - visual style is applied separately.`
      : `OPTIMIZE for web image search. Use concrete, searchable noun phrases.`;

   const llmContext = style.llmContext || '';

   // --- SHOT TYPES ---
   const useShotTypes = style.segmentationType === 'sentence';
   const outputSchema = useShotTypes
      ? `{"start": number, "end": number, "query": "string", "type": "pan"|"zoom"|"static", "linkedTo": number|null}`
      : `{"start": number, "end": number, "query": "string"}`;

   const shotTypeInstructions = useShotTypes
      ? `
CAMERA MOVEMENT (in "type" field ONLY):
- "pan" → wide landscapes, establishing new locations, environmental reveals
- "zoom" → dramatic emphasis, emotional close-ups, tension building
- "static" → action sequences, character focus, dialogue moments

VIDEO RETENTION:
- FIRST 2 SEGMENTS: Must use "pan" or "zoom"
- AVOID consecutive static segments`
      : '';

   // --- CRITICAL RULES ---
   const criticalRules = `
ENTITY CONSISTENCY (CRITICAL):
- Use the EXACT descriptions from the entity registry when referencing entities
- If a character is defined as "tall warrior with braided red beard", use that exact phrase
- If a location is defined as "narrow wooden bridge over river", use that exact description
- NEVER change entity descriptions between segments

VISUAL CONSISTENCY:
- All scenes should feel like they belong to the same video
- Maintain consistent lighting mood and color palette
- Keep the same visual tone across all segments

CONTEXTUAL ACCURACY:
- Only include elements that belong to the identified era/setting
- Never mix elements from different time periods

FORMAT RULES:
- PRESERVE timestamps exactly
- NEVER include text, words, letters, or numbers in visual descriptions
- Word count: ${useAiImage ? '20-50' : '8-15'} words per query`;

   return `# PERSONA
${persona}

# TASK
${task}

# STORY CONTEXT
${storyOverview}

# STYLE DIRECTION
${styleDirection}

${llmContext ? `# CREATIVE BRIEF\n${llmContext}\n` : ''}
${shotTypeInstructions}

${criticalRules}

# OUTPUT FORMAT
Return ONLY a valid JSON array. No markdown, no explanations.
Schema: ${outputSchema}`;
}

/**
 * Build context-aware user prompt for Phase 2 query generation
 * Includes entity registry and batch state from previous batch
 */
export function buildContextAwareUserPrompt(
   formattedTranscript: string,
   segmentCount: number,
   useAiImage: boolean,
   naturalEdit: boolean,
   storyContext: StoryContext,
   batchState: BatchState | null,
   currentSegments: [number, number]
): string {
   const wordCount = useAiImage ? '20-50' : '8-15';

   // Build the context injection with entity definitions
   const contextSection = buildContextInjection(storyContext, batchState, currentSegments);

   const typeField = naturalEdit
      ? `- INCLUDE "type" field: "pan", "zoom", or "static"
- INCLUDE "linkedTo" field: index of related previous segment, or null`
      : '';

   const outputExample = naturalEdit
      ? `[{"start": 0, "end": 5000, "query": "...", "type": "pan", "linkedTo": null}, ...]`
      : `[{"start": 0, "end": 5000, "query": "..."}, ...]`;

   return `${contextSection}

# TRANSCRIPT (${segmentCount} segments)
${formattedTranscript}

# EXECUTE
1. Reference entities using EXACT descriptions from above
2. GENERATE exactly ${segmentCount} queries
3. USE ${wordCount} words per query
4. COPY exact timestamps from segments
${typeField}

# OUTPUT
JSON array only:
${outputExample}`;
}
