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
   const persona = `You are a Lead Storyboard Artist for a high-end animation studio. Your job is to translate a script into a cohesive, frame-by-frame visual narrative.

   CORE RESPONSIBILITIES:
   1. VISUAL CONTINUITY: Every shot must look like it belongs to the same film. Lighting, color palette, and art style must stay locked.
   2. SPATIAL CONSISTENCY: If a character is on the left in one shot, they shouldn't magically teleport to the right unless there's a reason.
   3. ASSET FIDELITY: You must use the EXACT defined assets (characters, locations, objects) without altering their appearance.`;

   // --- TASK ---
   const task = `Create a sequence of detailed image prompts for an AI generation pipeline. 
   
   GOAL: transform the script into a contiguous visual flow.
   - Treat this as an ANIMATION or FILM production.
   - Each prompt is one keyframe.
   - Maintain the "Director's Vision" found in the Scene and Global Context.`;

   // --- CONTEXT: STORY OVERVIEW ---
   const storyOverview = `PRODUCTION CONTEXT:
- Era/Period: ${storyContext.era || 'Not specified'}
- Primary Location: ${storyContext.primarySetting || 'Various locations'}
- Visual Tone: ${storyContext.tone || 'Not specified'}`;

   // --- CONTEXT: STYLE ---
   const styleDirection = useAiImage
      ? `VISUAL STYLE GUIDE:
- Describe the SCENE only (what is filmed).
- DO NOT describe the artistic medium (e.g., "oil painting", "digital art") - this is handled by a separate style engine.
- Focus on LIGHTING, COMPOSITION, and ATMOSPHERE to glue the shots together.`
      : `OPTIMIZE for web image search. Use concrete, searchable noun phrases.`;

   // --- SHOT TYPES ---
   const useShotTypes = style.segmentationType === 'sentence';
   const outputSchema = useShotTypes
      ? `{"start": number, "end": number, "query": "string", "type": "pan"|"zoom"|"static", "linkedTo": number|null}`
      : `{"start": number, "end": number, "query": "string"}`;

   const shotTypeInstructions = useShotTypes
      ? `
CINEMATOGRAPHY RULES (The 'type' field):
- "pan": Use for establishing shots, wide environments, or following movement.
- "zoom": Use for emotional beats, realizations, or focusing on specific details.
- "static": The RAREST type. Only use for intimate dialogue close-ups or deliberate pauses. Default to pan/zoom.

EDITING FLOW:
- Vary your shot types to create rhythm.
- Do not stick on "static" for too long.
- SEQUENCE your shots: Wide -> Medium -> Close-up is a classic pattern.

VISUAL LINKING ('linkedTo'):
- This is crucial for consistency.
- If a shot relates to a previous one (e.g., same conversation, same room), LINK IT.
- This tells the renderer "Keep the visual data from that previous frame".`
      : '';

   // --- CRITICAL RULES ---
   const criticalRules = `
## QUERY CONTENT RULES (CRITICAL)

WHAT TO INCLUDE:
- SUFFUSE every query with the "Setting" and "Atmosphere" defined in the current scene.
- COPY & PASTE the "VISUAL ANCHOR" for any entity present. Do not summarize it.
- Action: What is happening in this frozen moment.

## SPATIAL & ENVIRONMENTAL CONSISTENCY
- The BACKGROUND must remain consistent. If they are in a "muddy trench with gray sky," EVERY shot in that scene must mention "muddy trench" and "gray sky".
- LIGHTING CONTINUITY: If it's "dawn" in shot 1, it generally shouldn't be "midnight" in shot 2 unless time passes.
- OBJECT PERMANENCE: If a table has a "red vase" on it in the wide shot, the close-up of the table must also have the "red vase" (or at least not contradict it).

## VISUAL SELF-CONTAINMENT
- The AI has NO MEMORY of previous images. 
- You MUST repeat the full visual description every time an entity appears.
- BAD: "The soldier looks tired."
- GOOD: "Close up of the 18-year-old Venetian soldier with a weary face, mud-stained woolen coat, and unkempt hair, looking exhausted against the backdrop of a rainy trench."

## NEGATIVE CONSTRAINTS (INSTANT FAIL IF VIOLATED)
1. ZERO TEXT/SYMBOLS. Never include: signs, labels, subtitles, speech bubbles, numbers, dates, years, letters, watermarks, logos, titles, captions, annotations, UI elements, or any readable characters. If you need to show a document, show "a weathered paper with illegible writing" — never actual text.
2. NO DIAGRAMS OR MAPS. Do not use "cross-section", "diagrammatic", "schematic", "map view", or "arrows". show the REALITY (e.g., the tunnel itself, not a drawing of it).
3. NO MONTAGES OR SPLIT SCREENS. Do not use "flashback montage", "split image", or "superimposed". Show ONE cohesive moment in time.
4. NO CAMERA TERMS in the query string. Do not use "zoom", "pan", "camera", "drone shot". Use the separate 'type' field for that.
5. NO META DESCRIPTIONS. Do not say "A historical painting of..." or "A realistic photo of...". Just describe the scene.
6. ABSOLUTELY NO LAZINESS. If a character is in the scene, their full visual anchor must be in the prompt.

## FINAL CONSISTENCY CHECK
Before outputting, verify:
1. Did I copy the VISUAL ANCHOR exactly?
2. Did I include the SETTING details (mud, gray sky, star-shaped walls)?
3. Does this shot visually match the previous one?
4. Is there any forbidden text (labels, dates, "concept")?
5. Is this a single, real scene (not a montage or map)?`;

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
   const wordCount = useAiImage ? '80-100' : '8-15';

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
1. Write EXACTLY ${segmentCount} image prompts — one per segment, no more, no less.
2. Use EXACT entity descriptions from registry above
3. Each query: ${wordCount} words, complete visual description
4. NO camera language in queries (camera movement goes in "type" field only)
${typeField}

# OUTPUT
JSON array with EXACTLY ${segmentCount} items:
${outputExample}

# CRITICAL: COUNT VERIFICATION
Before returning, verify your array has EXACTLY ${segmentCount} items.
If you return fewer or more, the entire response will be REJECTED and you must retry.`;
}
