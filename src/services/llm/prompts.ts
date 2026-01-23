/**
 * LLM Prompt templates using the 4-Pillar approach:
 * Persona, Task, Context, Format
 * 
 * Enhanced with entity-aware context injection for consistency
 */

import type { ResolvedStyle } from '../../styles/types.ts';
import type { StoryContext, BatchState } from '../../types/llm.ts';
import { SHOT_TYPE_SCHEMA } from '../../types/llm.ts';
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
   const task = `Output NATURAL LANGUAGE shot descriptions using bracket notation for references.

YOUR JOB: Write each shot as a natural sentence that embeds:
- Entity references using [entity_id] from the ENTITY REGISTRY
- Camera angle using [cameraAngle: X]
- Shot scale using [shotScale: Y]

The prompt builder will automatically expand [entity_id] to Name(visualAnchor).
You focus on COMPOSITION, ACTION, and STORYTELLING.`;

   // --- CONTEXT: STORY OVERVIEW ---
   const era = storyContext.globalEraConstraints?.era || 'Not specified';
   const techLevel = storyContext.globalEraConstraints?.technologyLevel || 'modern';
   const prohibitedItems = storyContext.globalEraConstraints?.prohibitedItems?.join(', ') || 'none';

   const storyOverview = `PRODUCTION CONTEXT:
- Era/Period: ${era}
- Technology Level: ${techLevel}
- Prohibited Items (anachronisms): ${prohibitedItems}
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
   
   const outputSchema = `{
  "start": number,
  "end": number,
  "action": "Natural language with [entity_id], [cameraAngle: X], [shotScale: Y] embedded",
  "framingNote": "optional framing guidance",
  "type": ${SHOT_TYPE_SCHEMA}
}`;

   const shotTypeInstructions = useShotTypes
      ? `
## BRACKET NOTATION (CRITICAL)

Your action field uses brackets to reference entities and camera settings:

### Entity References: [entity_id]
Use the EXACT ID from ENTITY REGISTRY. The prompt builder expands to Name(visualAnchor).
Example: [screaming_slave] → Screaming Slave(Adult Roman slave, olive skin, muscular build...)

### Camera Angle: [cameraAngle: X]
Embeds vertical perspective directly in the action.
ALLOWED VALUES:
  ├─ "Eye Level"     → camera at subject's eye height, neutral/relatable
  ├─ "Low Angle"     → camera BELOW subject, looking UP → power/dominance/threat
  ├─ "High Angle"    → camera ABOVE subject, looking DOWN → vulnerability/diminishment
  ├─ "Bird's Eye"    → camera directly ABOVE, top-down view → god's view, scale
  ├─ "Dutch Angle"   → camera TILTED, horizon at angle → disorientation/unease
  └─ "Over Shoulder" → camera BEHIND one character → POV intimacy

### Shot Scale: [shotScale: X]
Embeds framing distance directly in the action.
ALLOWED VALUES:
  ├─ "Wide Shot"         → FULL BODY + environment visible, establishes geography
  ├─ "Medium Shot"       → WAIST UP, balances character and context
  ├─ "Close-Up"          → FACE/DETAIL fills most of frame, emotional emphasis
  └─ "Extreme Close-Up"  → EYES/HANDS/OBJECTS only, maximum intimacy

### Example Actions:
✓ "A [cameraAngle: Low Angle] [shotScale: Medium Shot] of [vettius_pollio] holding a writhing [live_fish] above [screaming_slave]'s face"
✓ "[cameraAngle: High Angle] [shotScale: Wide Shot] showing [screaming_slave] falling toward the churning [eel_pools]"
✓ "[cameraAngle: Eye Level] [shotScale: Close-Up] of [emperor_augustus] watching with cold assessment"

### Inline Descriptions (No Entity):
When describing something NOT in the entity registry, write it inline:
✓ "A group of terrified servants pressed against the far wall, their faces illuminated by torchlight"
✓ "The shattered crystal fragments catching lamplight on the marble floor"

---

## FIELD: type (CAMERA MOVEMENT)
Controls camera MOVEMENT effect for video editing.
ALLOWED VALUES (pick exactly one):
  ├─ "pan"    → reveals space, follows motion, establishes geography
  ├─ "zoom"   → draws attention to important detail, emotional emphasis
  └─ "static" → deliberate stillness, lets moment breathe, adds weight

RHYTHM RULE: Vary movement types. Don't repeat same type 3+ times consecutively.

---

## COMBINING FOR EMOTIONAL INTENT

| Intent          | cameraAngle      | shotScale           | Effect                        |
|-----------------|------------------|---------------------|-------------------------------|
| Tension         | "Low Angle"      | "Close-Up"          | subject looms, feels threat   |
| Power           | "Low Angle"      | "Wide Shot"         | subject dominates the frame   |
| Vulnerability   | "High Angle"     | "Medium Shot"       | subject looks small, exposed  |
| Disorientation  | "Dutch Angle"    | "Close-Up"          | off-center, unsettling        |
| Intimacy        | "Eye Level"      | "Close-Up"          | direct connection with viewer |
| Observation     | "Bird's Eye"     | "Wide Shot"         | detached, god's view          |
| POV Connection  | "Over Shoulder"  | "Medium Shot"       | viewer becomes participant    |

---

## MISE-EN-SCÈNE CHECKLIST (What's in the frame?)
- SETTING: Location details that establish tone (cluttered vs. sterile, warm vs. cold light)
- PROPS: Objects that carry meaning (a weapon, a letter, an empty chair)
- POSITIONING: Where characters stand relative to each other (dominance, isolation, intimacy)
- LIGHTING: Harsh shadows = tension. Soft light = warmth. Silhouettes = mystery.

## DEPTH STAGING (MANDATORY)
- FOREGROUND: Elements that create tension, frame the shot, or add intimacy
- MIDGROUND: Where the action lives
- BACKGROUND: Context, threat, or environmental storytelling`
      : '';

   // --- CRITICAL RULES (Condensed for token efficiency) ---
   const contentType = storyContext.contentStrategy?.type || storyContext.contentType;

   const criticalRules = `
## HARD CONSTRAINTS (INSTANT REJECTION)
1. NO text/numbers/dates in action field (no "1944", no dialogue quotes)
2. NO diagrams/maps/montages/split screens—describe ONE moment
3. ONE idea per shot. If you need to explain what's happening, the shot is too busy.
4. All entity IDs in [brackets] must exist in ENTITY REGISTRY

## BRACKET NOTATION ENFORCEMENT
┌──────────────────────────────────────────────────────────────────────────────┐
│ Entity refs:    [entity_id]           → Must match ID from ENTITY REGISTRY  │
│ Camera angle:   [cameraAngle: X]      → X must be valid camera angle        │
│ Shot scale:     [shotScale: Y]        → Y must be valid shot scale          │
└──────────────────────────────────────────────────────────────────────────────┘

## CONTENT STRATEGY (From Phase 1 Analysis)
Content Type: ${contentType}
Visual Approach: ${storyContext.contentStrategy?.visualApproach}

## THE "BLOCKING FIRST" RULE
Before choosing your shot, mentally stage the scene:
- Where do characters stand?
- Who dominates space?
- Who is trapped, isolated, or exposed?
THEN choose composition and camera to REVEAL that truth.

## SYMBOLISM CONSISTENCY
- Use consistent visual metaphors. If swords represent honor, maintain that meaning.
- Don't dilute symbols. A recurring prop should carry the same emotional weight each time.

## ACTION FIELD RULES
- Write natural sentences (15-40 words) that embed [entity_id], [cameraAngle], [shotScale]
- Include physical action + environment interaction
- For things NOT in entity registry, describe inline with full detail
- Let the imagery carry the meaning. Trust the audience to interpret.`;

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
      ? `- WRITE "action" as natural sentence with [entity_id], [cameraAngle: X], [shotScale: Y] embedded
- SET "type": "pan", "zoom", or "static" (for video editing)
- SET "framingNote": optional specific framing details`
      : `- WRITE "action" with [entity_id] references
- SET "type": "pan" (default)`;

   const outputExample = naturalEdit
      ? `[{
  "start": 0,
  "end": 5000,
  "action": "A [cameraAngle: High Angle] [shotScale: Wide Shot] of [screaming_slave] suspended by ropes over the dark [eel_pools], body twisting in terror as torchlight flickers across the murky water below",
  "framingNote": "slave isolated in midground, dark water filling lower frame",
  "type": "static"
}, {
  "start": 5000,
  "end": 9000,
  "action": "[cameraAngle: Low Angle] [shotScale: Medium Shot] of [vettius_pollio] holding a writhing [live_fish] just above [screaming_slave]'s upturned face, cold satisfaction visible in his expression",
  "framingNote": "Pollio's hand and eel in foreground, slave's terror in background",
  "type": "zoom"
}, ...]`
      : `[{
  "start": 0,
  "end": 5000,
  "action": "[main_entity] walking across the cobblestone square",
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
2. DECIDE: Who/what is primary focus? Where are they in the scene?
3. WRITE: Natural sentence action with [entity_id], [cameraAngle: X], [shotScale: Y] embedded
4. Output EXACTLY ${segmentCount} structured shots — one per segment above.
5. Shot 1 = SEGMENT ${batchStart + 1}, Shot 2 = SEGMENT ${batchStart + 2}, etc.
6. Use entity IDs from ENTITY REGISTRY in [brackets].
7. For things NOT in registry, describe inline with full visual detail.
8. DEPTH: Every shot should have foreground/midground/background awareness.
9. FOCUS: ONE primary focus per shot. If everything is important, nothing is.
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
4. Verify all [entity_id] references exist in the ENTITY REGISTRY
5. Verify [cameraAngle: X] uses valid camera angle values
6. Verify [shotScale: Y] uses valid shot scale values

If your count does not match or shots don't correspond to their segments, the response will be REJECTED.`;
}
