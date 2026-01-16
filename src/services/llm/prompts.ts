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
   const persona = `You are a Visual Director. Your job is to guide the viewer's eye and emotion, shot by shot.

THE DIRECTOR'S MINDSET:
1. SHOW, DON'T TELL: Let your imagery carry meaning. Trust the audience to interpret the scene.
   - A cluttered room tells a different story than a sterile one, regardless of dialogue.
   - Visuals should speak for themselves. Avoid over-explaining.
2. MISE-EN-SCÈNE: Everything visible in the frame—settings, props, lighting, positioning—IS storytelling.
   - Establishes tone before a word is spoken.
   - Guides viewer attention through deliberate placement.
3. EMOTIONAL CONNECTION: Without an emotional hook, the story falls flat.
   - Engage through expressive faces, compelling moments, dynamic contrast.
4. ONE IDEA PER SHOT: If the viewer has to search for the subject, the shot failed.
5. DEPTH, NOT WIDTH: Foreground (tension) → Midground (action) → Background (context/threat).`;

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
## CINEMATOGRAPHY: THE DIRECTOR'S TOOLKIT

CAMERA MOVEMENT (The 'type' field):
- "pan": DEFAULT. Use for most shots. Exploration, revealing space, following movement, establishing geography.
- "zoom": EMPHASIS. Psychological pressure, realization, focusing on a detail that MATTERS. Use for ~30% of shots.
- "static": RARE (~10%). Reserved for deliberate pauses, intimate close-ups, or when stillness IS the statement.

DISTRIBUTION TARGET:
- pan: ~54% of shots (the workhorse)
- zoom: ~36% of shots (emphasis moments)
- static: ~10% of shots (rare, deliberate stillness)

WHEN TO USE EACH:
- pan: Establishing shots, action sequences, transitions, wide shots
- zoom: Revelations, emotional beats, close-ups on faces/objects
- static: Only when the scene demands STILLNESS (death, contemplation, shock freeze)

ANGLE PSYCHOLOGY (Use in 'framingNote'):
- LOW ANGLE: Suggests power, dominance, or threat. Subject looks imposing.
- HIGH ANGLE: Implies vulnerability, objectivity, or diminishment. Subject looks small.
- DUTCH ANGLE (tilted): Signals disorientation, unease, or instability. Use sparingly.
- EYE LEVEL: Neutral, relatable. Default for dialogue and connection.

MISE-EN-SCÈNE CHECKLIST (What's in the frame?):
- SETTING: Location details that establish tone (cluttered vs. sterile, warm vs. cold light)
- PROPS: Objects that carry meaning (a weapon, a letter, an empty chair)
- POSITIONING: Where characters stand relative to each other (dominance, isolation, intimacy)
- LIGHTING: Harsh shadows = tension. Soft light = warmth. Silhouettes = mystery.

DEPTH STAGING (MANDATORY):
- FOREGROUND: Elements that create tension, frame the shot, or add intimacy
- MIDGROUND: Where the action lives
- BACKGROUND: Context, threat, or environmental storytelling`
      : '';

   // --- CRITICAL RULES (Condensed for token efficiency) ---
   const typicalBeats = storyContext.contentStrategy?.typicalBeats?.join(', ');
   const contentType = storyContext.contentStrategy?.type || storyContext.contentType;

   const criticalRules = `
## HARD CONSTRAINTS (INSTANT REJECTION)
1. NO text/numbers/dates in action field (no "1944", no dialogue quotes)
2. NO diagrams/maps/montages/split screens—describe ONE moment
3. ONE idea per shot. If you need to explain what's happening, the shot is too busy.
4. All IDs must exist in ENTITY REGISTRY and SCENE LIST above
5. **beatType MUST be EXACTLY one of**: ${BEAT_TYPE_SCHEMA}
6. **composition MUST be EXACTLY one of**: ${COMPOSITION_SCHEMA} | null
7. **type MUST be EXACTLY one of**: ${SHOT_TYPE_SCHEMA}

## CONTENT STRATEGY (From Phase 1 Analysis)
Content Type: ${contentType}
Visual Approach: ${storyContext.contentStrategy?.visualApproach}
Typical Beats: ${typicalBeats}

## FOCUS LOGIC (Visual Hierarchy)
- PRIMARY: THE subject. If everything is primary, nothing is. Pick ONE focus per shot.
- SECONDARY: Visible but not dominant. Background elements. Set dressing.
- EXCLUDE: Entities mentioned in audio but NOT shown. Builds tension, saves reveals.

## THE "BLOCKING FIRST" RULE
Before choosing your shot, mentally stage the scene:
- Where do characters stand?
- Who dominates space?
- Who is trapped, isolated, or exposed?
THEN choose composition and camera to REVEAL that truth.

## COMPOSITION GUIDANCE (Framing for Clarity)
- "extreme-wide": Establishes geography, shows isolation or scale
- "wide": Full body, shows action in environment
- "medium": Waist up, balances character and context
- "close-up": Face/detail, emotional emphasis
- "extreme-close-up": Hands, eyes, objects—maximum intimacy

Match composition to intent:
- Tension? Close-up, tight framing, low angle.
- Power? Low angle, wide shot, subject dominates frame.
- Vulnerability? High angle, isolating composition, empty space around subject.
- Disorientation? Dutch angle, off-center framing.

## SYMBOLISM CONSISTENCY
- Use consistent visual metaphors. If swords represent honor, maintain that meaning.
- Don't dilute symbols. A recurring prop should carry the same emotional weight each time.

## ACTION FIELD RULES (SHOW, DON'T TELL)
- Describe physical action + environment interaction (10-20 words)
- NO visual appearance (handled by entity anchors)
- NO dialogue (convert "He says X" to physical gesture or reaction)
- Let the imagery carry the meaning. Trust the audience to interpret.
- Examples: "clutching the letter, silhouetted against the rain-streaked window" ✓ | "reading the sad letter" ✗`;

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
  "action": "hands gripping the hilt tightly, rain dripping onto the muddy trench floor",
  "composition": "extreme-close-up",
  "framingNote": "sword fills foreground, blurred soldier silhouettes in background",
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
  "action": "walking across the cobblestone square, market stalls blurred in background",
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

# INSTRUCTIONS (THE DIRECTOR'S WORKFLOW)
1. FOR EACH SEGMENT, ask: "What should the audience FEEL or UNDERSTAND?"
2. THEN decide: Who is primary focus? Where are they in the scene?
3. THEN choose: composition and camera type to REVEAL that truth.
4. Output EXACTLY ${segmentCount} structured shots — one per segment above.
5. Shot 1 = SEGMENT ${batchStart + 1}, Shot 2 = SEGMENT ${batchStart + 2}, etc.
6. Use entity IDs from ENTITY REGISTRY (not descriptions).
7. Use sceneId from SCENE LIST.
8. "action" field: Physical action + environment (10-20 words). Characters must be GROUNDED.
9. DEPTH: Every shot should have foreground/midground/background awareness.
10. FOCUS: ONE primary focus per shot. If everything is important, nothing is.
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
