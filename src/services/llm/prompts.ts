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
   const task = `Output STRUCTURED SHOT METADATA for each segment. You do NOT write image prompts—those are generated automatically from your structured output.
   
   YOUR JOB: Identify WHO is in the shot, WHERE it takes place, and WHAT ACTION is happening.
   - Reference entities by their ID from the ENTITY REGISTRY
   - Reference scenes by their ID from the SCENE LIST
   - Describe only the ACTION, not visual appearances (handled automatically)`;

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
      ? `{
  "start": number,
  "end": number,
  "sceneId": "scene_id_from_context",
  "presentEntities": ["entity_id1", "entity_id2"],
  "focusEntities": ["entity_id1"],
  "action": "what is happening in this frozen moment",
  "composition": "wide shot" | "medium shot" | "close-up" | "extreme close-up" | null,
  "type": "pan" | "zoom" | "static",
  "linkedTo": number | null
}`
      : `{"start": number, "end": number, "sceneId": "scene_id", "presentEntities": ["id"], "action": "description"}`;

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
## TEXT ELIMINATION (ABSOLUTE ZERO TOLERANCE)
1. NEVER include quoted dialogue from transcript in action field
2. NEVER include numbers, years, dates, times (e.g., "1944", "3am", "June 12")
3. NEVER use words: "sign", "label", "poster", "handwritten", "typed", "subtitle", "title card", "text", "writing", "inscription"
4. Convert dialogue to visual description:
   - BAD: "He says 'Attack at dawn'"
   - GOOD: "officer gesturing urgently while addressing his men"
5. NEVER include: speech bubbles, watermarks, logos, titles, captions, annotations, UI elements

## ENTITY REFERENCES (CRITICAL)
- Use entity IDs from the ENTITY REGISTRY, not descriptions
- The "action" field describes WHAT HAPPENS, not what entities look like
- Visual descriptions are handled automatically—you just need to identify WHO is present
- List ALL entities visible in frame in "presentEntities"
- List entities that should be prominently featured in "focusEntities"

## SCENE CONSISTENCY
- Use sceneId from the SCENE LIST to maintain setting consistency
- All shots within a scene automatically inherit the scene's backdrop
- When the narrative moves to a new location, switch to the appropriate sceneId
- If no scene matches, use the most relevant one or "default"

## COMPOSITION GUIDANCE
- Use "composition" to suggest framing: "wide shot", "medium shot", "close-up", "extreme close-up"
- Wide shots for establishing, close-ups for emotional beats
- Leave null if no specific framing is needed

## NEGATIVE CONSTRAINTS (INSTANT FAIL)
1. NO text/symbols of any kind in action descriptions
2. NO diagrams, maps, cross-sections, schematics
3. NO montages or split screens—describe ONE moment
4. NO camera terms in action field (use "type" field)
5. NO meta descriptions ("A painting of...", "An image showing...")

## ACTION FIELD RULES
- Describe physical actions and body language only
- NO visual appearance details (those come from entity anchors)
- NO dialogue content
- Keep it concise: 5-15 words typically
- Examples:
  - GOOD: "standing at attention, saluting"
  - GOOD: "leaning forward intently, hands gripping the table"
  - BAD: "the tall soldier with blue eyes stands at attention" (no appearance)
  - BAD: "saying 'we must attack now'" (no dialogue)`;

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
   // Build the context injection with entity definitions
   const contextSection = buildContextInjection(storyContext, batchState, currentSegments);

   const typeField = naturalEdit
      ? `- SET "type": "pan", "zoom", or "static" (for video editing)
- SET "linkedTo": index of related segment (< current index), or null
- SET "composition": framing guidance or null`
      : '';

   const outputExample = naturalEdit
      ? `[{
  "start": 0,
  "end": 5000,
  "sceneId": "trench_scene",
  "presentEntities": ["protagonist", "commander"],
  "focusEntities": ["protagonist"],
  "action": "crouching low, peering over the edge",
  "composition": "medium shot",
  "type": "pan",
  "linkedTo": null
}, ...]`
      : `[{"start": 0, "end": 5000, "sceneId": "main_scene", "presentEntities": ["entity_1"], "action": "walking through the doorway"}, ...]`;

   return `${contextSection}

# TRANSCRIPT (${segmentCount} segments)
${formattedTranscript}

# INSTRUCTIONS
1. Output EXACTLY ${segmentCount} structured shots — one per segment
2. Use entity IDs from ENTITY REGISTRY (not descriptions)
3. Use sceneId from SCENE LIST
4. "action" field: ONLY what is happening (5-15 words), NO visual descriptions
5. NO dialogue, NO numbers/dates, NO text references in action field
${typeField}

# OUTPUT
JSON array with EXACTLY ${segmentCount} items:
${outputExample}

# CRITICAL: COUNT VERIFICATION (ZERO TOLERANCE)
You MUST return EXACTLY ${segmentCount} items. Not ${segmentCount - 1}. Not ${segmentCount + 1}. EXACTLY ${segmentCount}.

Before returning:
1. COUNT your array items
2. If count ≠ ${segmentCount}, STOP and fix it
3. Verify each action field has NO visual descriptions (just actions)
4. Verify all entity/scene IDs exist in the registries above

If you return fewer or more items, the entire response will be REJECTED.`;
}
