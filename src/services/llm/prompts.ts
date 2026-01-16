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
5. **beatType MUST be EXACTLY one of**: ${BEAT_TYPE_SCHEMA}
   **DO NOT INVENT NEW VALUES. USE ONLY THE EXACT VALUES LISTED ABOVE.**
6. **composition MUST be EXACTLY one of**: ${COMPOSITION_SCHEMA} | null
   **DO NOT INVENT NEW VALUES. USE ONLY THE EXACT VALUES LISTED ABOVE.**
7. **type MUST be EXACTLY one of**: ${SHOT_TYPE_SCHEMA}
   **DO NOT INVENT NEW VALUES. USE ONLY THE EXACT VALUES LISTED ABOVE.**

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

## SCENE CONSISTENCY (CRITICAL)
- You MUST use sceneId from the SCENE LIST provided above
- Look at the segment index and find which scene's segmentRange contains it
- "default" is NEVER acceptable - always pick the closest matching scene
- If a segment falls between scenes, use the scene it's closest to

## COMPOSITION GUIDANCE
- Use "composition" to suggest framing: "extreme-wide", "wide", "medium", "close-up", "extreme-close-up"
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
 * Uses explicit segment indexing for 1:1 mapping enforcement
 */
export function buildContextAwareUserPrompt(
   formattedTranscript: string,
   segmentCount: number,
   naturalEdit: boolean,
   storyContext: StoryContext,
   batchState: BatchState | null,
   currentSegments: [number, number],
   totalSegments?: number  // Total segments across all batches
): string {
   // Build the context injection with entity definitions
   const contextSection = buildContextInjection(storyContext, batchState, currentSegments);

   // Calculate absolute indices for segment labeling
   const [batchStart] = currentSegments;
   const globalTotal = totalSegments ?? segmentCount;
   const isPartialBatch = batchStart > 0 || segmentCount < globalTotal;

   // Build indexed transcript with explicit segment markers
   const lines = formattedTranscript.split(/\r?\n/).filter(l => l.trim().length > 0);
   const indexedTranscript = lines.map((line, i) => {
      const globalIndex = batchStart + i + 1;  // 1-based
      const position = globalIndex === 1 ? '(OPENING)' :
         globalIndex === globalTotal ? '(CLOSING)' :
            globalIndex <= 3 ? '(EARLY)' :
               globalIndex >= globalTotal - 2 ? '(LATE)' : '';
      return `[SEGMENT ${globalIndex} of ${globalTotal}${position ? ' ' + position : ''}]\n${line}`;
   }).join('\n\n');

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

   // Build segment range description for batch context
   const batchRangeDesc = isPartialBatch
      ? ` (Segments ${batchStart + 1}-${batchStart + segmentCount} of ${globalTotal})`
      : '';

   return `${contextSection}

# TRANSCRIPT${batchRangeDesc}
Each segment is labeled with its EXACT index. Your output array MUST match these indices.

${indexedTranscript}

# INSTRUCTIONS
1. Output EXACTLY ${segmentCount} structured shots — one per segment above
2. Shot 1 in your array = SEGMENT ${batchStart + 1}, Shot 2 = SEGMENT ${batchStart + 2}, etc.
3. Use entity IDs from ENTITY REGISTRY (not descriptions)
4. Use sceneId from SCENE LIST
5. "action" field: ONLY what is happening (5-15 words), NO visual descriptions
6. NO dialogue, NO numbers/dates, NO text references in action field
7. FOCUS LOGIC:
   - "primary": What the shot is ABOUT (main visual subject, gets full detail)
   - "secondary": Supporting elements visible but not dominant (background)
   - "exclude": Entities mentioned but NOT shown (builds tension, reveals later)
8. Match beatType to the narrative purpose of each moment
9. Consider segment position (OPENING/EARLY/LATE/CLOSING) for appropriate visual treatment
${typeField}

# OUTPUT
JSON array with EXACTLY ${segmentCount} items, matching segments ${batchStart + 1}-${batchStart + segmentCount}:
${outputExample}

# CRITICAL: INDEX VERIFICATION (ZERO TOLERANCE)
You MUST return EXACTLY ${segmentCount} shots for segments ${batchStart + 1} through ${batchStart + segmentCount}.

Before returning:
1. COUNT your array items — must be EXACTLY ${segmentCount}
2. VERIFY: Shot 1 matches SEGMENT ${batchStart + 1}'s content
3. VERIFY: Shot ${segmentCount} matches SEGMENT ${batchStart + segmentCount}'s content
4. Verify each action field has NO visual descriptions (just actions)
5. Verify all entity/scene IDs exist in the registries above

If your count does not match or shots don't correspond to their segments, the response will be REJECTED.`;
}
