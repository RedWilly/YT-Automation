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
   const persona = `You are a prompt engineer for AI image generation. You write detailed, self-contained image descriptions that produce consistent, visually striking results.`;

   // --- TASK ---
   const task = `Write ONE image prompt per transcript segment. Each prompt must be a complete standalone description that an AI image generator can render WITHOUT any context from other prompts.`;

   // --- CONTEXT: STORY OVERVIEW ---
   const storyOverview = `STORY CONTEXT:
- Setting: ${storyContext.era || 'Not specified'} - ${storyContext.primarySetting || 'Various locations'}
- Tone: ${storyContext.tone || 'Not specified'}`;

   // --- CONTEXT: STYLE ---
   const styleDirection = useAiImage
      ? `DESCRIBE the visual scene only. Style/aesthetic is applied separately by the system.`
      : `OPTIMIZE for web image search. Use concrete, searchable noun phrases.`;

   // --- SHOT TYPES ---
   const useShotTypes = style.segmentationType === 'sentence';
   const outputSchema = useShotTypes
      ? `{"start": number, "end": number, "query": "string", "type": "pan"|"zoom"|"static", "linkedTo": number|null}`
      : `{"start": number, "end": number, "query": "string"}`;

   const shotTypeInstructions = useShotTypes
      ? `
TYPE FIELD (for video editing - completely separate from query):
- "pan" → use for: landscapes, establishing shots, wide environmental scenes
- "zoom" → use for: close-ups, dramatic emphasis, detail reveals
- "static" → use for: action, character moments, dialogue

TYPE SELECTION RULES:
- FIRST 2 SEGMENTS: Must use "pan" or "zoom" for viewer retention
- AVOID consecutive static segments

LINKEDTO FIELD (for visual consistency seeding):
- Set to INDEX of most visually related previous segment, or null for new scenes
- MUST be less than current index (can only reference earlier segments)
- First segment (index 0) MUST have linkedTo: null
- Example: segment 5 can only use linkedTo: 0, 1, 2, 3, 4, or null`
      : '';

   // --- CRITICAL RULES ---
   const criticalRules = `
## QUERY CONTENT RULES (CRITICAL)

WHAT TO INCLUDE in the query:
- Subject: WHO or WHAT is in the frame (use entity descriptions exactly)
- Action: What is happening in this frozen moment
- Setting: Where this takes place (location, environment)
- Atmosphere: Lighting, mood, weather, time of day
- Composition: Foreground/background elements, framing

WHAT TO NEVER INCLUDE in the query:
- Camera movement words: "camera pans", "zooms in", "tracking shot", "dolly", etc.
- Director language: "we see", "the viewer", "cut to", "fade in"
- Transition words: "then", "next", "afterwards"
- Meta descriptions: "dramatic shot of", "close-up of", "wide angle of"
- The word "camera" in any context

BAD EXAMPLE: "The camera zooms out to reveal a massive army approaching the bridge"
GOOD EXAMPLE: "A lone warrior on a narrow wooden bridge, a massive iron-clad army visible on the distant hillside, morning mist rising from the river below"

## VISUAL SELF-CONTAINMENT

Each query must contain ALL visual information needed to render the image:
- The AI image generator has NO MEMORY of previous images
- It cannot see your other prompts
- Describe everything visible in THIS frame completely
- Repeat key visual details (character appearance, location features) when they appear

## ENTITY CONSISTENCY

When an entity from the registry appears:
- Use the EXACT description phrase provided
- Do not paraphrase or shorten entity descriptions
- This ensures the AI generates consistent visuals across images

## FORMAT

- Word count: ${useAiImage ? '25-45' : '8-15'} words per query
- PRESERVE timestamps exactly from the transcript
- NEVER include readable text, letters, numbers, or signs in descriptions`;

   return `# PERSONA
${persona}

# TASK
${task}

# ${storyOverview}

# STYLE
${styleDirection}

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
   const wordCount = useAiImage ? '25-45' : '8-15';

   // Build the context injection with entity definitions
   const contextSection = buildContextInjection(storyContext, batchState, currentSegments);

   const typeField = naturalEdit
      ? `- SET "type": "pan", "zoom", or "static" (for video editing, NOT in query text)
- SET "linkedTo": index of related segment (< current index), or null`
      : '';

   const outputExample = naturalEdit
      ? `[{"start": 0, "end": 5000, "query": "a lone Viking warrior...", "type": "pan", "linkedTo": null}, ...]`
      : `[{"start": 0, "end": 5000, "query": "..."}, ...]`;

   return `${contextSection}

# TRANSCRIPT (${segmentCount} segments)
${formattedTranscript}

# INSTRUCTIONS
1. Write ${segmentCount} image prompts (one per segment)
2. Use EXACT entity descriptions from registry above
3. Each query: ${wordCount} words, complete visual description
4. NO camera language in queries (camera movement goes in "type" field only)
${typeField}

# OUTPUT
JSON array:
${outputExample}`;
}
