/**
 * LLM Prompt templates using the 4-Pillar approach:
 * Persona, Task, Context, Format
 * 
 * Enhanced with entity-aware context injection for consistency
 */

import type { ResolvedStyle } from '../../styles/types.ts';
import type { StoryContext, BatchState } from '../../types/llm.ts';
import { BEAT_TYPE_SCHEMA, COMPOSITION_SCHEMA, SHOT_TYPE_SCHEMA } from '../../types/llm.ts';
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
   const persona = `You are a Visual Director for a professional video production studio. Your job is to translate ANY content—stories, educational material, documentaries, product showcases, abstract concepts—into compelling visual sequences.

CORE RESPONSIBILITIES:
1. CONTENT AWARENESS: Understand WHAT type of content this is and adapt your visual approach
2. VISUAL CONSISTENCY: Maintain coherent visual language throughout
3. SMART FOCUS: Show what matters for each moment, exclude what doesn't
4. UNIVERSAL APPLICATION: Handle narratives, explainers, documentaries, products, and abstract content equally well`;

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
  "beatType": ${BEAT_TYPE_SCHEMA},
  "focus": {
    "primary": ["entity_id"],
    "secondary": ["entity_id"],
    "exclude": ["entity_id"]
  },
  "action": "what is physically happening",
  "composition": ${COMPOSITION_SCHEMA} | null,
  "framingNote": "optional specific framing guidance",
  "type": ${SHOT_TYPE_SCHEMA}
}`
      : `{
  "start": number,
  "end": number,
  "sceneId": "scene_id",
  "beatType": ${BEAT_TYPE_SCHEMA},
  "focus": {
    "primary": ["entity_id"],
    "secondary": [],
    "exclude": []
  },
  "action": "what is happening",
  "composition": null,
  "type": "pan"
}`;

   const shotTypeInstructions = useShotTypes
      ? `
CINEMATOGRAPHY RULES (The 'type' field):
- "pan": Use for establishing shots, wide environments, or following movement.
- "zoom": Use for emotional beats, realizations, or focusing on specific details.
- "static": The RAREST type. Only use for intimate dialogue close-ups or deliberate pauses. Default to pan/zoom.

EDITING FLOW:
- Vary your shot types to create rhythm.
- Do not stick on "static" for too long.
- SEQUENCE your shots: Wide -> Medium -> Close-up is a classic pattern.`
      : '';

   // --- CRITICAL RULES (Condensed for token efficiency) ---
   const typicalBeats = storyContext.contentStrategy?.typicalBeats?.join(', ');
   const contentType = storyContext.contentStrategy?.type || storyContext.contentType;

   const criticalRules = `
## HARD CONSTRAINTS (INSTANT REJECTION)
1. NO text/numbers/dates in action field (no "1944", no dialogue quotes)
2. NO diagrams/maps/montages/split screens—describe ONE moment
3. Action field = 5-15 words, physical description only, NO appearances
4. All IDs must exist in ENTITY REGISTRY and SCENE LIST above

## CONTENT STRATEGY (From Phase 1 Analysis)
Content Type: ${contentType}
Visual Approach: ${storyContext.contentStrategy?.visualApproach}
Typical Beats: ${typicalBeats}

## FOCUS LOGIC
- PRIMARY: What the shot is ABOUT (main visual subject, gets full detail)
- SECONDARY: Supporting elements visible but not dominant (names only in background)
- EXCLUDE: Entities mentioned but NOT shown (builds tension, reveals later)

## VISUAL RHYTHM (CRITICAL)
Create VARIETY in composition:
- Don't repeat the same composition 3+ times in a row
- After WIDE, go MEDIUM or CLOSE-UP
- After CLOSE-UP, often pull back to WIDE
- Climactic moments earn dynamic compositions

Good rhythm: WIDE → MEDIUM → CLOSE-UP → EXTREME-CLOSE-UP → WIDE
Bad rhythm: MEDIUM → MEDIUM → MEDIUM → MEDIUM

## SCENE CONSISTENCY
- Use sceneId from the SCENE LIST to maintain setting consistency
- All shots within a scene automatically inherit the scene's backdrop
- When the narrative moves to a new location, switch to the appropriate sceneId
- If no scene matches, use the most relevant one or "default"

## COMPOSITION GUIDANCE
- Use "composition" to suggest framing: "extreme-wide", "wide", "medium", "close-up", "extreme-close-up", "two-shot"
- Use "framingNote" for specific guidance (e.g., "sword fills frame, knuckles white")
- Match composition to beatType for maximum impact
- Leave null if no specific framing is needed

## NEGATIVE CONSTRAINTS (INSTANT FAIL)
1. NO text/symbols of any kind in action descriptions
2. NO diagrams, maps, cross-sections, schematics
3. NO montages or split screens—describe ONE moment
4. NO camera terms in action field (use "type" field)
5. NO meta descriptions ("A painting of...", "An image showing...")

## ACTION FIELD RULES
- Describe physical actions and body language only
- NO visual appearance details (handled by entity anchors)
- NO dialogue content (convert "He says X" to physical gesture)
- Examples: "standing at attention, saluting" ✓ | "saying 'attack now'" ✗`;

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
   naturalEdit: boolean,
   storyContext: StoryContext,
   batchState: BatchState | null,
   currentSegments: [number, number]
): string {
   // Build the context injection with entity definitions
   const contextSection = buildContextInjection(storyContext, batchState, currentSegments);

   const typeField = naturalEdit
      ? `- SET "beatType": narrative purpose of this shot
- SET "focus": { "primary": main focus, "secondary": background, "exclude": not in shot }
- SET "type": "pan", "zoom", or "static" (for video editing)
- SET "composition": framing guidance or null
- SET "framingNote": optional specific framing details`
      : `- SET "beatType": purpose of this shot (action, explanation, establishing, etc.)
- SET "focus": { "primary": main focus entities, "secondary": [], "exclude": [] }
- SET "type": "pan" (default)
- SET "composition": null`;

   const outputExample = naturalEdit
      ? `[{
  "start": 0,
  "end": 5000,
  "sceneId": "battlefield",
  "beatType": "emotional",
  "focus": {
    "primary": ["fathers_sword"],
    "secondary": ["marcus"],
    "exclude": ["enemy_soldiers"]
  },
  "action": "hands gripping the hilt tightly",
  "composition": "extreme-close-up",
  "framingNote": "sword fills frame, knuckles white",
  "type": "static"
}, ...]`
      : `[{
  "start": 0,
  "end": 5000,
  "sceneId": "main_scene",
  "beatType": "action",
  "focus": {
    "primary": ["main_entity"],
    "secondary": [],
    "exclude": []
  },
  "action": "walking through the scene",
  "composition": null,
  "type": "pan"
}]`;

   return `${contextSection}

# TRANSCRIPT (${segmentCount} segments)
${formattedTranscript}

# INSTRUCTIONS
1. Output EXACTLY ${segmentCount} structured shots — one per segment
2. Use entity IDs from ENTITY REGISTRY (not descriptions)
3. Use sceneId from SCENE LIST
4. "action" field: ONLY what is happening (5-15 words), NO visual descriptions
5. NO dialogue, NO numbers/dates, NO text references in action field
6. FOCUS LOGIC:
   - "primary": What the shot is ABOUT (main visual subject, gets full detail)
   - "secondary": Supporting elements visible but not dominant (background)
   - "exclude": Entities mentioned but NOT shown (builds tension, reveals later)
7. Match beatType to the narrative purpose of each moment
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
