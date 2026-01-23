/** Phase 1: Context extraction from transcripts (entities, scenes, and narrative structure) */

import { getAIConfig } from '../../config/index.ts';
import type { LLMResponse } from '../../types/index.ts';
import type { StoryContext, BatchState, EraConstraints } from '../../types/llm.ts';
import {
    CONTENT_TYPE_SCHEMA,
    VISUAL_APPROACH_SCHEMA,
    ENTITY_TYPE_SCHEMA,
    TECHNOLOGY_LEVEL_SCHEMA,
} from '../../types/llm.ts';
import * as logger from '../../utils/logger.ts';

export function buildExtractionSystemPrompt(): string {
    return `You are a PRE-PRODUCTION DIRECTOR preparing visual assets for a video production. Your job is to analyze the transcript and extract everything a director needs to shoot compelling visuals.

# THE DIRECTOR'S MINDSET
You are NOT just cataloging content. You are answering:
1. What should the audience FEEL or UNDERSTAND at each moment?
2. What visual elements (characters, objects, settings) carry emotional weight?
3. How do power dynamics and spatial relationships tell the story?
4. What should be SHOWN vs. what should be IMPLIED (referenced but not seen)?

# TASK
Analyze the transcript and extract:
1. CONTENT TYPE: What kind of content is this?
2. ENTITIES: All VISUALIZABLE elements (characters, locations, objects, concepts)
3. GROUPS: Shared visual identities
4. SCENES: Locations with directorial information (tone, lighting, power dynamics)
5. NARRATIVE BEATS: The emotional intent for each segment
6. METADATA: Setting, tone, summary
7. ERA CONSTRAINTS: Time period appropriateness

# CONTENT TYPE DETECTION (FIRST STEP)
Before extracting entities, identify the content type:
- "narrative": Stories with characters, plot, conflict, story arc
- "educational": Explains concepts, teaches, how-to, tutorials
- "documentary": Real events, history, nature, places, biographies
- "product": Showcases items, features, benefits, demos
- "abstract": Conceptual, artistic, metaphorical, philosophical
- "motivational": Inspirational, life lessons, quotes, self-improvement
- "comparison": Compares alternatives, pros/cons, vs videos
- "news": Current events, reports, announcements

# ENTITY EXTRACTION BY CONTENT TYPE
Adapt entity types based on detected content:

NARRATIVE → characters, groups, locations, objects, animals
EDUCATIONAL → concepts, steps, examples, comparisons, processes, data
DOCUMENTARY → subjects, events, locations, evidence, people
PRODUCT → features, benefits, use-cases, the product, competitors
ABSTRACT → symbols, themes, metaphors, emotions
MOTIVATIONAL → themes, examples, outcomes, quotes (as concepts)
COMPARISON → alternatives, criteria, outcomes, pros, cons
NEWS → events, people, locations, data

- **ENTITY EXTRACTION RULES (STRICT VISUALS)**:
  - Each entity MUST have a **visualAnchor**: the SOLE visual source for image generation.
  - **visualAnchor is PROMPT-READY**: a dense, comma-separated visual descriptor fragment usable VERBATIM in an image prompt.
  - **CRITICAL**: Use ONLY physical, visual adjectives (colors, textures, materials, shapes, silhouettes).
  - **AVOID**: Abstract adjectives ("brave", "corrupt", "mysterious"). Instead use visual cues: "scarred face, tattered cloak, torch-lit".
  - **ABSOLUTELY FORBIDDEN in visualAnchor**:
    - NO narrative ("he later..."), NO future events ("eventually destroyed"), NO story beats
    - NO verbs describing actions, NO timeline words ("later", "eventually", "becomes")
    - NO abstract concepts that cannot be photographed
  - Rate importance: primary (main focus), secondary (supporting), background (minor)
  - **SEGMENT INDEXING (CRITICAL)**:
  - The transcript has segments numbered [0] to [N-1] where N = total segments
  - "mentions" = segment INDICES in range notation. MUST be within [0, N-1].
  - **GAPS ARE MEANINGFUL**: The ranges indicate WHERE the entity IS PRESENT. Segments NOT in ranges = entity is ABSENT.
    - ["0-50"] → Entity appears in ALL 51 segments (continuous presence)
    - ["0-10", "17-40", "42-49"] → Entity is ABSENT in segments 11-16 and 41 (gaps = not mentioned)
  - **VALUES OUTSIDE SEGMENT RANGE WILL BE REJECTED**
  - **DO NOT use milliseconds or timestamps. Use ONLY segment indices.**
- For characters, assign a role: leader, soldier, civilian, or background
- If a character belongs to a group/faction, set groupId to the group's id

# VISUAL ANCHOR CONTRACT (MANDATORY)
visualAnchor MUST be detailed, era-specific, and immediately usable in an image prompt.

**FOR CHARACTERS** - include ALL of:
- Age range, build, skin tone/ethnicity (if stated), hair style/color, facial hair
- Clothing layers + materials + colors (MUST be era-appropriate: Roman = tunic/toga, Medieval = doublet/hose, etc.)
- Footwear + headwear (era-appropriate)
- Gear/props they carry (era-appropriate weapons, tools)
- Defining marks (scars, tattoos, jewelry, distinctive features)

**FOR LOCATIONS** - include ALL of:
- Architecture style + materials (stone, mudbrick, timber, marble), period-specific features
- Layout features, ground texture, vegetation, water features
- Lighting/atmosphere as a STATIC descriptor (e.g., "overcast daylight", "torch-lit interior")
- NO future events ("later destroyed") - describe the CURRENT visual state only

**FOR OBJECTS** - include ALL of:
- Material, size, condition, ornamentation, era-appropriate details
- Color, texture, distinctive features

**FOR CONCEPTS/ABSTRACTS** - provide a VISUAL REPRESENTATION:
- How to depict this visually (e.g., "split-screen comparison", "symbolic imagery of chains breaking")

**GOOD vs BAD EXAMPLES**:
- BAD: "A wealthy Roman man who later loses his power" (narrative, future event)
- GOOD: "Middle-aged Roman man, olive skin, clean-shaven, purple-trimmed white toga, gold rings on fingers, commanding posture, cold calculating expression"
- BAD: "The pool that is later filled with earth" (future event)
- GOOD: "Large rectangular freshwater pool, 20 meters wide, murky green water, rough-cut stone edges, torch-lit, steam rising from surface"

# GROUP EXTRACTION RULES
- Identify factions, armies, teams, or any collection of characters with shared visual identity
- Each group has a visualAnchor describing shared appearance (e.g., "red cloaks, bronze armor, plumed helmets")
- memberIds lists all character entity IDs that belong to this group (use range notation like "soldier_1-soldier_10")

# ERA CONSTRAINTS RULES
Identify the historical/fictional era and determine:
- allowedWeapons: What weapons are appropriate (swords in medieval, rifles in WW2)
- prohibitedItems: What items would be anachronistic (no guns in medieval, no smartphones in 1800s)
- technologyLevel: prehistoric, ancient, medieval, industrial, modern, futuristic

# SCENE GROUPING RULES (DIRECTORIAL)
- Group consecutive segments that share the same location/context
- A new scene starts when location changes OR there's a significant time jump
- Each scene should list which entities are present

FOR EACH SCENE, ADD DIRECTORIAL INFORMATION:
- visualTone: How should this scene FEEL? ("claustrophobic", "expansive", "intimate", "chaotic", "sterile")
- powerDynamic: Who dominates space? Who is vulnerable? ("hero isolated", "villain looms", "equals face off")
- keyProps: Symbolic objects that carry emotional weight in this scene ("the sword", "the letter", "the empty chair")
- mood: VISUAL atmosphere descriptors (NOT emotions). Use comma-separated visual adjectives.
  ✓ GOOD: "dark, tense, shadowy, claustrophobic"
  ✓ GOOD: "bright, chaotic, dusty, crowded"
  ✗ BAD: "tragic, hopeful, bittersweet" (abstract emotions, not visual)
  ✗ BAD: "The moment when hope dies" (narrative, not descriptor)
- lightingCue: REUSABLE lighting descriptors for image prompts. Use visual terms only.
  ✓ GOOD: "harsh orange backlighting, heavy smoke, deep shadows"
  ✓ GOOD: "soft diffused daylight, warm tones, minimal shadows"
  ✗ BAD: "The hellish glow of the burning city" (narrative/story-specific)
  ✗ BAD: "Lighting that reflects his inner turmoil" (abstract, not visual)

# OUTPUT FORMAT
Return a valid JSON object with this structure:
{
    "summary": "Brief overview of the content",
    "contentType": ${CONTENT_TYPE_SCHEMA},
    "contentStrategy": {
        "type": "same as contentType",
        "visualApproach": ${VISUAL_APPROACH_SCHEMA},
        "entityMeaning": "What entities represent in this content type",
    },
    "primarySetting": "Main location/environment/context",
    "tone": "Overall mood/atmosphere",
    "globalEraConstraints": {
        "era": "Late Roman Republic|Medieval England|WW2 Europe|Modern|etc - be SPECIFIC",
        "allowedWeapons": ["era-appropriate weapons"],
        "prohibitedItems": ["items that would be anachronistic for this era"],
        "technologyLevel": ${TECHNOLOGY_LEVEL_SCHEMA}
    },
    "entities": [
        {
            "id": "unique_snake_case_id",
            "type": ${ENTITY_TYPE_SCHEMA},
            "name": "Display Name",
            "visualAnchor": "PROMPT-READY visual description: age, build, skin tone, hair, clothing+materials+colors (era-appropriate), footwear, gear, defining marks. NO narrative, NO events.",
            "eraConstraints": null,
            "importance": "primary|secondary|background",
            "mentions": ["0-5", "8-12"],
            "groupId": "optional_group_id (for characters in factions)",
            "role": "leader|soldier|civilian|background (for characters)"
        }
    ],
    "groups": [
        {
            "id": "group_id",
            "name": "Group Name",
            "visualAnchor": "Shared era-appropriate appearance for ALL members (clothing, armor, colors, materials)",
            "memberIds": ["member_1", "member_2-member_10"],
        }
    ],
    "scenes": [
        {
            "id": "scene_id",
            "name": "Scene/Section Name",
            "description": "What happens in this section",
            "segmentRange": [0, 15],
            "primaryEntities": ["entity_id1"],
            "secondaryEntities": ["entity_id2"],
            "setting": "Where/when this happens or context",
            "mood": "Tone of this section",
            "visualTone": "claustrophobic|expansive|intimate|chaotic|etc",
            "powerDynamic": "Who dominates? Who is vulnerable?",
            "keyProps": ["symbolic_object_1", "symbolic_object_2"],
            "lightingCue": "harsh shadows|soft warmth|silhouette|cold blue|etc"
        }
    ]
}

## CRITICAL RULES (INSTANT FAIL IF VIOLATED)

1. **SEGMENT INDICES, NOT MILLISECONDS**: mentions[] MUST use segment indices (0 to N-1). Values like 172650 are WRONG.

2. **BOUNDS CHECK**: All segment indices MUST be within [0, N-1] where N = segment count.
   - 238 segments → valid range: 0-237
   - CORRECT: ["0-50", "60-100", "150-237"] (gaps show entity is ABSENT in segments 51-59, 101-149)
   - WRONG: ["0-500"] when N=238 (500 > 237 is out of bounds)

3. **VISUAL ANCHOR MUST BE PROMPT-READY** (INSTANT REJECTION if violated):
   - MUST include: physical appearance, era-appropriate clothing/materials/colors
   - MUST NOT include: narrative, future events, story beats, verbs, "later", "eventually"
   - "A mysterious man" → WRONG (abstract)
   - "Later shown being filled with earth" → WRONG (narrative/future)
   - "Middle-aged Roman man, olive skin, purple-trimmed toga, gold rings, cold expression" → RIGHT

4. **ERA CONSISTENCY**: All visualAnchors MUST match the detected era in globalEraConstraints.
   - Ancient/Roman → togas, tunics, sandals, bronze/iron weapons
   - Medieval → doublets, mail, swords, torches
   - Modern → suits, casual wear, contemporary items
   - Use prohibitedItems from globalEraConstraints to avoid anachronisms

5. **ANTI-PATTERNS (DO NOT DO THESE)**:
   - DO NOT list "The Narrator" as a character unless they are VISUALLY present on screen.
   - DO NOT invent locations that aren't mentioned or clearly implied.
   - DO NOT use generic visualAnchors for Primary Entities. Every main character needs a DISTINCT, DETAILED look.

6. **NEVER TRUNCATE**: Output the COMPLETE JSON. Prioritize PRIMARY entities over BACKGROUND ones if space is limited.

7. **USE RANGE NOTATION**: For mentions[], use compact ranges. Gaps indicate segments where entity is NOT present.

8. **VALID JSON ONLY**: No markdown code blocks. No explanations. Just raw, parseable JSON.

Return ONLY valid JSON.`;
}

/** Build user prompt for context extraction */
export function buildExtractionUserPrompt(transcript: string, segmentCount: number): string {
    return `# TRANSCRIPT
Total Segments: ${segmentCount}
Valid Segment Index Range: 0 to ${segmentCount - 1}

CRITICAL: All "firstMention" and "mentions" values MUST be within 0-${segmentCount - 1}.
Any value >= ${segmentCount} is INVALID and will be REJECTED.

${transcript}

# EXECUTE
1. READ the entire transcript carefully
2. IDENTIFY all entities (characters, locations, objects, animals, concepts, groups)
3. GROUP segments into scenes based on location/context changes
4. EXTRACT metadata (era, setting, tone)
5. VERIFY all segment indices are within 0-${segmentCount - 1}
6. RETURN structured JSON

Return ONLY valid JSON.`;
}

// ============================================================================
// Context Injection for Query Generation
// ============================================================================

/** Build context injection for query generation prompts */
export function buildContextInjection(
    context: StoryContext,
    batchState: BatchState | null,
    currentSegments: [number, number]
): string {
    // Find which scene(s) the current batch belongs to
    const relevantScenes = context.scenes.filter(scene => {
        const [sceneStart, sceneEnd] = scene.segmentRange;
        const [batchStart, batchEnd] = currentSegments;
        return sceneStart <= batchEnd && sceneEnd >= batchStart;
    });

    // -------------------------------------------------------------------------
    // STORY OVERVIEW (Big Picture Context)
    // -------------------------------------------------------------------------
    let overviewSection = '== STORY OVERVIEW ==\n';
    overviewSection += `Summary: ${context.summary}\n`;
    overviewSection += `Tone: ${context.tone}\n`;
    overviewSection += `Setting: ${context.primarySetting}\n\n`;

    // -------------------------------------------------------------------------
    // SCENE ARC (Where We Are in the Story)
    // -------------------------------------------------------------------------
    const currentSceneId = relevantScenes[0]?.id || '';
    const currentSceneIndex = context.scenes.findIndex(s => s.id === currentSceneId);

    let sceneArcSection = '== SCENE ARC ==\n';
    context.scenes.forEach((scene, i) => {
        const marker = scene.id === currentSceneId ? '→ ' : '  ';
        const position = i === 0 ? '(OPENING)' :
            i === context.scenes.length - 1 ? '(CLOSING)' : '';
        sceneArcSection += `${marker}${i + 1}. ${scene.name} [${scene.segmentRange[0] + 1}-${scene.segmentRange[1] + 1}] ${position}\n`;
    });
    sceneArcSection += `\nCurrently: Scene ${currentSceneIndex + 1} of ${context.scenes.length}\n\n`;

    // -------------------------------------------------------------------------
    // GROUPS/FACTIONS (For Faction Awareness)
    // -------------------------------------------------------------------------
    let groupsSection = '';
    if (context.groups && context.groups.length > 0) {
        groupsSection = '== GROUPS/FACTIONS ==\n';
        for (const group of context.groups) {
            groupsSection += `${group.id}: ${group.name}\n`;
            groupsSection += `  Visual: ${group.visualAnchor}\n`;
            groupsSection += `  Members: ${group.memberIds.join(', ')}\n`;
        }
        groupsSection += '\n';
    }

    // -------------------------------------------------------------------------
    // DETERMINE RELEVANT ENTITIES (Predictive, not Reactive)
    // -------------------------------------------------------------------------
    const relevantEntityIds = new Set<string>();
    const [batchStart, batchEnd] = currentSegments;

    for (const entity of context.entities) {
        // STRATEGY: Err on the side of inclusion. 
        // If an entity exists in the story, the LLM should know about it 
        // so it doesn't accidentally hallucinate a duplicate or inconsistent version.

        // Rule 1: Always include PRIMARY & SECONDARY entities (consistency anchors)
        // We want the LLM to have the full "cast list" available even if they aren't speaking right now.
        if (entity.importance === 'primary' || entity.importance === 'secondary') {
            relevantEntityIds.add(entity.id);
            continue;
        }

        // Rule 2: Include background entities if they are mentioned or in the scene
        const isMentionedInBatch = entity.mentions.some(
            idx => idx >= batchStart && idx <= batchEnd
        );

        const isInCurrentScene = relevantScenes.some(scene =>
            scene.primaryEntities.includes(entity.id) ||
            scene.secondaryEntities.includes(entity.id)
        );

        if (isMentionedInBatch || isInCurrentScene) {
            relevantEntityIds.add(entity.id);
        }
    }

    // Filter to relevant entities
    const relevantEntities = context.entities.filter(e => relevantEntityIds.has(e.id));

    // -------------------------------------------------------------------------
    // BUILD ASSET REGISTRY (ALL ENTITIES ARE CRITICAL)
    // -------------------------------------------------------------------------
    let entitySection = '== VISUAL ASSETS REGISTRY (MANDATORY USE) ==\n';
    entitySection += 'Every entity below is a FIXED visual asset. Even if the story progresses, their base appearance (Visual Anchor) DOES NOT CHANGE unless explicitly stated.\n';
    entitySection += 'You mostly simply COPY AND PASTE the Visual Anchor into your prompt. Do not paraphrase. Do not get creative with their defined look.\n\n';

    // Sort entities by importance for organization, but include ALL details for everyone
    const sortedEntities = relevantEntities.sort((a, b) => {
        const impOrder = { 'primary': 0, 'secondary': 1, 'background': 2 };
        return impOrder[a.importance] - impOrder[b.importance];
    });

    for (const e of sortedEntities) {
        entitySection += `ID: ${e.id} (${e.importance.toUpperCase()} ${e.type.toUpperCase()})\n`;
        entitySection += `VISUAL ANCHOR: "${e.visualAnchor}"\n`;
        if (e.eraConstraints) {
            entitySection += `CONSTRAINTS: Allowed [${e.eraConstraints.allowedWeapons.join(', ')}], Prohibited [${e.eraConstraints.prohibitedItems.join(', ')}]\n`;
        }
        entitySection += '\n';
    }

    // Build scene section with directorial information (for context only - not referenced by ID)
    let sceneSection = '== CURRENT SCENE CONTEXT ==\n';

    if (relevantScenes.length > 0) {
        const scene = relevantScenes[0];
        if (scene) {
            sceneSection += `LOCATION: ${scene.name}\n`;
            sceneSection += `SETTING: ${scene.setting}\n`;
            sceneSection += `MOOD: ${scene.mood}\n`;

            // Directorial fields
            if (scene.visualTone) {
                sceneSection += `VISUAL TONE: ${scene.visualTone}\n`;
            }
            if (scene.powerDynamic) {
                sceneSection += `POWER DYNAMIC: ${scene.powerDynamic}\n`;
            }
            if (scene.keyProps && scene.keyProps.length > 0) {
                sceneSection += `KEY PROPS (symbolic): ${scene.keyProps.join(', ')}\n`;
            }
            if (scene.lightingCue) {
                sceneSection += `LIGHTING: ${scene.lightingCue}\n`;
            }

            sceneSection += `Segments: ${scene.segmentRange[0] + 1}-${scene.segmentRange[1] + 1}\n`;
        }
    }
    sceneSection += '\n';

    let stateSection = '';

    // DETECT SCENE CUT
    // batchState.currentScene holds the scene ID from the PREVIOUS batch
    const isNewScene = batchState && batchState.currentScene !== currentSceneId;
    // Note: currentSceneId is defined earlier in the sceneArc section

    if (batchState && batchState.batchIndex > 0) {
        if (isNewScene) {
            // SCENE CUT DETECTED: Do NOT show previous images to prevent bleeding
            stateSection = '== TRANSITION: CUT TO NEW SCENE ==\n';
            stateSection += 'Previous scene has ended. START FRESH.\n';
            stateSection += 'Ignore previous visual continuity. Establish the NEW setting immediately.\n\n';
        } else if (batchState.lastQueries.length > 0) {
            // SAME SCENE: Enforce visual continuity
            stateSection = '== VISUAL CONTINUITY (PREVIOUS BATCH) ==\n';
            stateSection += 'The last few shots generated were (SAME SCENE):\n';
            batchState.lastQueries.forEach((q, i) => {
                stateSection += `[Prev-${2 - i}]: "${q}"\n`;
            });
            stateSection += 'INSTRUCTION: Your first new shot must visually follow "Prev-1" to maintain the storyboard sequence.\n\n';
        }
    }

    // Build instruction section with directorial focus
    const instructionSection = `== DIRECTOR'S INSTRUCTIONS ==
Generate structured shots for segments ${currentSegments[0] + 1}-${currentSegments[1] + 1}.

THE DIRECTOR'S QUESTION (ask for EACH segment):
"What should the audience FEEL or UNDERSTAND right now?"
- If the answer is about a CHARACTER's emotion → focus on character, use [shotScale: Close-Up]
- If the answer is about POWER/THREAT → use [cameraAngle: Low Angle], show dominance
- If the answer is about VULNERABILITY → use [cameraAngle: High Angle], isolate the subject
- If the answer is about a LOCATION/SETTING → use [shotScale: Wide Shot], establish the space
- If the answer is about an OBJECT → focus on the object, use the scene as background

BRACKET NOTATION:
- Reference entities using [entity_id] from the ENTITY REGISTRY above
- Embed camera angles using [cameraAngle: X] 
- Embed shot scales using [shotScale: Y]
- For things NOT in the registry, describe them inline with full visual detail

MANDATORY RULES:
1. Use entity IDs from the VISUAL ASSETS REGISTRY in [brackets]
2. Each shot must have depth: foreground/midground/background awareness
3. Use the LIGHTING and VISUAL TONE from the scene context above
4. Symbolic props (keyProps) should appear when emotionally relevant
`;

    return `${overviewSection}${sceneArcSection}${groupsSection}${entitySection}${sceneSection}${stateSection}${instructionSection}`;
}

// ============================================================================
// Extraction API
// ============================================================================

/** Extract story context from transcript using LLM */
export async function extractStoryContext(
    transcript: string,
    segmentCount: number,
    maxRetries: number = 3
): Promise<StoryContext> {
    const aiConfig = getAIConfig();

    logger.step('Context', 'Extracting story context from transcript');
    logger.log('Context', `Analyzing ${segmentCount} segments for entities and scenes`);

    const systemPrompt = buildExtractionSystemPrompt();
    const userPrompt = buildExtractionUserPrompt(transcript, segmentCount);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const context = await attemptContextExtraction(
                aiConfig,
                systemPrompt,
                userPrompt,
                segmentCount
            );

            // Validate we got meaningful results
            if (context.entities.length === 0 && context.scenes.length === 0) {
                throw new Error('Context extraction returned empty entities and scenes');
            }

            logger.success(
                'Context',
                `Extracted ${context.entities.length} entities and ${context.scenes.length} scenes`
            );

            return context;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                logger.warn(
                    'Context',
                    `Context extraction failed (attempt ${attempt}/${maxRetries}): ${lastError.message}. Retrying...`
                );
            }
        }
    }

    // All retries exhausted
    logger.error('Context', `Context extraction failed after ${maxRetries} attempts`);
    throw new Error(`Context extraction failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/** Attempt single context extraction */
async function attemptContextExtraction(
    aiConfig: ReturnType<typeof getAIConfig>,
    systemPrompt: string,
    userPrompt: string,
    segmentCount: number
): Promise<StoryContext> {
    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
            model: aiConfig.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: aiConfig.temperature,
            max_tokens: aiConfig.maxTokens,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Context extraction API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json() as LLMResponse;
    const content = data.choices[0]?.message?.content;

    logger.debug('Context', `Raw response length: ${content?.length ?? 0} chars`);
    // logger.debug('Context', `Full LLM response:\n${content}`);

    if (!content) {
        throw new Error('Empty response from context extraction');
    }

    return parseStoryContext(content, segmentCount);
}

/**
 * Default era constraints for fallback
 */
const DEFAULT_ERA_CONSTRAINTS: EraConstraints = {
    era: 'unspecified',
    allowedWeapons: [],
    prohibitedItems: [],
    technologyLevel: 'modern',
};

/** Parse LLM response into StoryContext object */
function parseStoryContext(content: string, segmentCount?: number): StoryContext {
    // Clean up the response (remove markdown code blocks if present)
    let cleaned = content.trim();
    // logger.log('Context', `Raw context extraction response: ${cleaned}`);
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    try {
        const parsed = JSON.parse(cleaned) as Partial<StoryContext>;

        // Validate required fields
        if (!parsed.entities || !Array.isArray(parsed.entities)) {
            parsed.entities = [];
        }
        if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
            parsed.scenes = [];
        }
        if (!parsed.summary) parsed.summary = '';
        if (!parsed.primarySetting) parsed.primarySetting = '';
        if (!parsed.tone) parsed.tone = '';

        if (!parsed.contentType) {
            parsed.contentType = 'narrative'; // Default to narrative for backward compatibility
        }

        if (!parsed.contentStrategy) {
            parsed.contentStrategy = {
                type: parsed.contentType,
                visualApproach: 'realistic',
                entityMeaning: 'Visual elements in the content',
            };
        }

        if (!parsed.globalEraConstraints) {
            parsed.globalEraConstraints = {
                ...DEFAULT_ERA_CONSTRAINTS,
            };
        }

        if (!parsed.groups || !Array.isArray(parsed.groups)) {
            parsed.groups = [];
        }
        parsed.groups = parsed.groups.map((group) => ({
            ...group,
            memberIds: expandMemberIds(group.memberIds),
        }));

        parsed.entities = parsed.entities.map((entity) => {
            const mentions = expandMentionRanges(entity.mentions, segmentCount);
            return {
                ...entity,
                // visualAnchor is the SOLE visual source - no fallback to narrative description
                visualAnchor: entity.visualAnchor || '',
                eraConstraints: entity.eraConstraints ?? null,
                mentions,
            };
        });

        // Validate scene segment ranges
        if (segmentCount) {
            parsed.scenes = parsed.scenes.map(scene => ({
                ...scene,
                segmentRange: [
                    Math.max(0, Math.min(scene.segmentRange[0], segmentCount - 1)),
                    Math.max(0, Math.min(scene.segmentRange[1], segmentCount - 1)),
                ] as [number, number],
            }));
        }

        return parsed as StoryContext;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Context', `Failed to parse context extraction response: ${errorMsg}`);
        throw new Error(`Failed to parse context JSON: ${errorMsg}`);
    }
}

/** Validate segment index is within bounds */
function validateSegmentIndex(index: unknown, maxSegments?: number): number {
    const num = typeof index === 'number' ? index : 0;
    if (!maxSegments) return Math.max(0, num);
    return Math.max(0, Math.min(num, maxSegments - 1));
}

/** Expand mention ranges from compact notation to full arrays, bounded by segment count */
function expandMentionRanges(mentions: unknown, maxSegments?: number): number[] {
    if (!mentions || !Array.isArray(mentions)) {
        return [];
    }

    const result: number[] = [];
    const maxIndex = maxSegments ? maxSegments - 1 : Infinity;

    for (const item of mentions) {
        if (typeof item === 'number') {
            if (item >= 0 && item <= maxIndex) {
                result.push(item);
            }
        } else if (typeof item === 'string') {
            if (item.includes('-')) {
                const [startStr, endStr] = item.split('-');
                const start = Math.max(0, parseInt(startStr ?? '', 10));
                const end = Math.min(maxIndex, parseInt(endStr ?? '', 10));
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    for (let i = start; i <= end; i++) {
                        result.push(i);
                    }
                }
            } else {
                const num = parseInt(item, 10);
                if (!isNaN(num) && num >= 0 && num <= maxIndex) {
                    result.push(num);
                }
            }
        }
    }

    return result;
}

/** Expand group memberIds from range notation to full arrays */
function expandMemberIds(memberIds: unknown): string[] {
    if (!memberIds || !Array.isArray(memberIds)) {
        return [];
    }

    const result: string[] = [];

    for (const item of memberIds) {
        if (typeof item !== 'string') {
            continue;
        }

        // Check for range notation like "soldier_2-soldier_10"
        const rangeMatch = item.match(/^(.+?)(\d+)-\1(\d+)$/);
        if (rangeMatch) {
            const prefix = rangeMatch[1];
            const start = parseInt(rangeMatch[2] ?? '', 10);
            const end = parseInt(rangeMatch[3] ?? '', 10);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    result.push(`${prefix}${i}`);
                }
            }
        } else {
            // Regular ID, just add it
            result.push(item);
        }
    }

    return result;
}

/** Create initial batch state */
export function createInitialBatchState(): BatchState {
    return {
        batchIndex: 0,
        lastQueries: [],
        activeEntities: [],
        currentScene: '',
        currentMood: '',
    };
}

/** Update batch state after processing a batch */
export function updateBatchState(
    previousState: BatchState,
    queries: string[],
    activeEntities: string[],
    currentScene: string,
    currentMood: string
): BatchState {
    // Keep last 3 queries for immediate visual continuity (Sliding Window)
    // This allows the next batch to "hook" onto the previous visual flow
    const lastQueries = queries.slice(-3);

    return {
        batchIndex: previousState.batchIndex + 1,
        lastQueries,
        activeEntities,
        currentScene, // This becomes 'previousScene' for the next batch
        currentMood,
    };
}
