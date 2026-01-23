/**
 * LLM Prompt templates using the 4-Pillar approach:
 * Persona, Task, Context, Format
 * 
 * Enhanced with entity-aware context injection for consistency
 */

import type { ResolvedStyle } from '../../styles/types.ts';
import type { StoryContext, BatchState } from '../../types/llm.ts';
import { CAMERA_ANGLE_SCHEMA, SHOT_SCALE_SCHEMA, SHOT_TYPE_SCHEMA } from '../../types/llm.ts';
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
   const outputSchema = useShotTypes
      ? `{
  "start": number,
  "end": number,
  "sceneId": "scene_id_from_SCENE_LIST",
  "focus": {
    "emphasis": ["entity_id"],  // 1-2 entities to FOCUS on (from scene's entities)
    "exclude": ["entity_id"]    // entities mentioned but NOT shown
  },
  "action": "physical action only - NO visual descriptions",
  "cameraAngle": ${CAMERA_ANGLE_SCHEMA} | null,
  "shotScale": ${SHOT_SCALE_SCHEMA} | null,
  "framingNote": "optional framing guidance",
  "type": ${SHOT_TYPE_SCHEMA}
}`
      : `{
  "start": number,
  "end": number,
  "sceneId": "scene_id",
  "focus": {
    "emphasis": ["entity_id"],
    "exclude": []
  },
  "action": "what is happening",
  "cameraAngle": null,
  "shotScale": null,
  "type": "pan"
}`;

   const shotTypeInstructions = useShotTypes
      ? `
## SCHEMA DEFINITIONS (EXACT VALUES REQUIRED)

### FIELD: type (CAMERA MOVEMENT)
Controls camera MOVEMENT effect for video editing.
ALLOWED VALUES (pick exactly one):
  ├─ "pan"    → reveals space, follows motion, establishes geography
  ├─ "zoom"   → draws attention to important detail, emotional emphasis
  └─ "static" → deliberate stillness, lets moment breathe, adds weight

RHYTHM RULE: Vary movement types. Don't repeat same type 3+ times consecutively.

---

### FIELD: cameraAngle (VERTICAL PERSPECTIVE)
Controls where camera looks FROM (vertical position relative to subject).
ALLOWED VALUES (pick exactly one, or null):
  ├─ "Eye Level"     → camera at subject's eye height, neutral/relatable
  ├─ "Low Angle"     → camera BELOW subject, looking UP → power/dominance/threat
  ├─ "High Angle"    → camera ABOVE subject, looking DOWN → vulnerability/diminishment
  ├─ "Bird's Eye"    → camera directly ABOVE, top-down view → god's view, scale
  ├─ "Dutch Angle"   → camera TILTED, horizon at angle → disorientation/unease
  └─ "Over Shoulder" → camera BEHIND one character → POV intimacy

---

### FIELD: shotScale (FRAMING DISTANCE)
Controls how much of subject fills the frame (distance from subject).
ALLOWED VALUES (pick exactly one, or null):
  ├─ "Wide Shot"         → FULL BODY + environment visible, establishes geography
  ├─ "Medium Shot"       → WAIST UP, balances character and context
  ├─ "Close-Up"          → FACE/DETAIL fills most of frame, emotional emphasis
  └─ "Extreme Close-Up"  → EYES/HANDS/OBJECTS only, maximum intimacy

---

⚠️ CRITICAL: DO NOT CONFUSE THESE FIELDS ⚠️
┌─────────────────────────────────────────────────────────────────────┐
│ "Close-Up" is a shotScale (FRAMING), NOT a cameraAngle             │
│ "Low Angle" is a cameraAngle (PERSPECTIVE), NOT a shotScale        │
│ "Wide Shot" is a shotScale (FRAMING), NOT a cameraAngle            │
│ "Eye Level" is a cameraAngle (PERSPECTIVE), NOT a shotScale        │
│                                                                     │
│ Each field has its OWN set of valid values that NEVER overlap!     │
└─────────────────────────────────────────────────────────────────────┘

---

## COMBINING FIELDS FOR EMOTIONAL INTENT

Use this table to select cameraAngle + shotScale based on what you want the audience to feel:

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
4. All IDs must exist in ENTITY REGISTRY and SCENE LIST above

## SCHEMA ENFORCEMENT (EXACT VALUES ONLY)
┌──────────────┬─────────────────────────────────────────────────────────────────┐
│ FIELD        │ EXACT VALID VALUES                                              │
├──────────────┼─────────────────────────────────────────────────────────────────┤
│ type         │ "pan" | "zoom" | "static"                                       │
│ cameraAngle  │ "Eye Level" | "Low Angle" | "High Angle" | "Bird's Eye" |       │
│              │ "Dutch Angle" | "Over Shoulder" | null                          │
│ shotScale    │ "Wide Shot" | "Medium Shot" | "Close-Up" | "Extreme Close-Up" | │
│              │ null                                                            │
└──────────────┴─────────────────────────────────────────────────────────────────┘

REMEMBER:
- cameraAngle = WHERE camera looks FROM (vertical perspective)
- shotScale = HOW MUCH of subject is in frame (framing distance)
- DO NOT CONFUSE cameraAngle and shotScale!

## CONTENT STRATEGY (From Phase 1 Analysis)
Content Type: ${contentType}
Visual Approach: ${storyContext.contentStrategy?.visualApproach}

## SCENE INHERITANCE (CRITICAL - READ CAREFULLY)
Your shot INHERITS from the scene automatically:
- Scene's primaryEntities are AUTO-INCLUDED (you don't specify them)
- Scene's setting, mood, lighting, keyProps are AUTO-APPLIED
- You ONLY specify:
  1. "emphasis": Which 1-2 entities to FOCUS on (subset of scene entities)
  2. "exclude": Which entities to HIDE from this specific shot
  3. "action": What is physically happening

Example: Scene has primaryEntities ["vettius_pollio", "screaming_slave", "moray_eel", "eel_pools"]
- Your emphasis: ["screaming_slave"] → slave is the focus
- Your exclude: ["vettius_pollio"] → Pollio not shown
- AUTO-INCLUDED as secondary: moray_eel, eel_pools (because they're in the scene)

## FOCUS LOGIC
- EMPHASIS: The 1-2 entities to FOCUS on. Pick the emotional center of the shot.
- EXCLUDE: Entities mentioned in audio but NOT shown. Builds tension, saves reveals.
- Everything else in the scene is automatically visible as context.

## THE "BLOCKING FIRST" RULE
Before choosing your shot, mentally stage the scene:
- Where do characters stand?
- Who dominates space?
- Who is trapped, isolated, or exposed?
THEN choose composition and camera to REVEAL that truth.

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
      ? `- SET "focus.emphasis": 1-2 entity IDs to FOCUS on (from scene's entities)
- SET "focus.exclude": entity IDs to HIDE from this shot
- SET "type": "pan", "zoom", or "static" (for video editing)
- SET "cameraAngle": camera perspective
- SET "shotScale": framing distance
- SET "framingNote": optional specific framing details
NOTE: Scene's other entities are AUTO-INCLUDED as secondary context`
      : `- SET "focus.emphasis": main entity to focus on
- SET "focus.exclude": [] (entities to hide)
- SET "type": "pan" (default)`;

   const outputExample = naturalEdit
      ? `[{
  "start": 0,
  "end": 5000,
  "sceneId": "scene_1",
  "focus": {
    "emphasis": ["screaming_slave"],
    "exclude": ["vettius_pollio"]
  },
  "action": "suspended by ropes over the dark water, struggling against bonds",
  "cameraAngle": "Low Angle",
  "shotScale": "Medium Shot",
  "framingNote": "slave centered, guards' boots visible in foreground",
  "type": "static"
}, ...]`
      : `[{
  "start": 0,
  "end": 5000,
  "sceneId": "main_scene",
  "focus": {
    "emphasis": ["main_entity"],
    "exclude": []
  },
  "action": "walking across the cobblestone square",
  "cameraAngle": null,
  "shotScale": null,
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
