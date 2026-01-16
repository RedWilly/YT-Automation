/** Phase 1: Context extraction from transcripts (entities, scenes, and narrative structure) */

import { getAIConfig } from '../../config/index.ts';
import type { LLMResponse } from '../../types/index.ts';
import type { StoryContext, BatchState, EraConstraints } from '../../types/llm.ts';
import { BEAT_TYPES } from '../../types/llm.ts';
import * as logger from '../../utils/logger.ts';

export function buildExtractionSystemPrompt(): string {
    return `You are a visual content analyst for a universal video production system. Your task is to analyze ANY type of transcript—stories, educational content, documentaries, product videos, abstract concepts—and extract structured information for visual generation.

# TASK
Analyze the transcript and extract:
1. CONTENT TYPE: What kind of content is this? (narrative, educational, documentary, product, abstract, motivational, comparison, news)
2. ENTITIES: All visual elements appropriate to the content type
3. GROUPS: Shared visual identities (factions for narrative, categories for educational, etc.)
4. SCENES: How segments group together
5. NARRATIVE BEATS: The purpose/beat for each segment
6. METADATA: Setting, tone, summary
7. ERA CONSTRAINTS: Time period appropriateness (if applicable)

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
  - Each entity needs a clear VISUAL DESCRIPTION (for image generation)
  - Each entity MUST have a **VISUAL ANCHOR**: immutable visual traits that define this entity.
  - **CRITICAL**: Use ONLY physical, visual adjectives (colors, textures, lighting, shapes).
  - **AVOID**: Abstract adjectives ("brave", "corrupt", "mysterious"). Instead use visual cues: "scarred face, tattered cloak, flickering torchlight".
  - Identify explicit mentions AND implicit references ("he", "it", "the warrior" → entity ID)
  - Rate importance: primary (main focus), secondary (supporting), background (minor)
  - **SEGMENT INDEXING (CRITICAL)**:
  - The transcript has segments numbered [0] to [N-1] where N = total segments
  - "firstMention" = segment INDEX (0 to N-1). Example: if 238 segments, valid values are 0-237
  - "mentions" = segment INDICES in range notation. MUST be within [0, N-1].
  - **GAPS ARE MEANINGFUL**: The ranges indicate WHERE the entity IS PRESENT. Segments NOT in ranges = entity is ABSENT.
    - ["0-50"] → Entity appears in ALL 51 segments (continuous presence)
    - ["0-10", "17-40", "42-49"] → Entity is ABSENT in segments 11-16 and 41 (gaps = not mentioned)
  - This helps determine which entities to include when generating visuals for each segment
  - **VALUES OUTSIDE SEGMENT RANGE WILL BE REJECTED**
  - **DO NOT use milliseconds or timestamps. Use ONLY segment indices.**
- For characters, assign a role: leader, soldier, civilian, or background
- If a character belongs to a group/faction, set groupId to the group's id

# GROUP EXTRACTION RULES
- Identify factions, armies, teams, or any collection of characters with shared visual identity
- Each group has a visualAnchor describing shared appearance (e.g., "red cloaks, bronze armor, plumed helmets")
- memberIds lists all character entity IDs that belong to this group (use range notation like "soldier_1-soldier_10")
- allegiance: protagonist (heroes), antagonist (enemies), or neutral

# BEAT RULES (UNIVERSAL - ADAPT TO CONTENT TYPE)
Analyze EACH segment for its beat type. Use beats appropriate to the content:

NARRATIVE BEATS:
- establishing: Setting the scene, location focus
- action: Movement, conflict, physical activity
- emotional: Character feelings, reactions, intimate moments
- dialogue: Conversation between characters
- tension: Building suspense, anticipation
- climax: Peak moment, payoff
- resolution: Aftermath, calm after storm
- transition: Moving between scenes/moments

EDUCATIONAL BEATS:
- introduction: Presenting a topic, overview
- explanation: Describing how/why something works
- example: Showing a specific case or illustration
- demonstration: Showing how to do something
- comparison: Contrasting two or more things
- summary: Recap, key takeaways

DOCUMENTARY BEATS:
- context: Historical/factual background
- evidence: Data, facts, proof
- testimony: Quotes, statements

PRODUCT BEATS:
- showcase: Highlighting a feature
- benefit: Showing advantage/outcome
- use-case: Demonstrating application

Rate importance: high (key moment), medium (supporting), low (filler)
suggestedFocus: what should be primary focus (character, object, setting, action, group, concept)

# ERA CONSTRAINTS RULES
Identify the historical/fictional era and determine:
- allowedWeapons: What weapons are appropriate (swords in medieval, rifles in WW2)
- prohibitedItems: What items would be anachronistic (no guns in medieval, no smartphones in 1800s)
- technologyLevel: prehistoric, ancient, medieval, industrial, modern, futuristic

# SCENE GROUPING RULES
- Group consecutive segments that share the same location/context
- A new scene starts when location changes OR there's a significant time jump
- Each scene should list which entities are present

# OUTPUT FORMAT
Return a valid JSON object with this structure:
{
    "summary": "Brief overview of the content",
    "contentType": "narrative|educational|documentary|product|abstract|motivational|comparison|news",
    "contentStrategy": {
        "type": "same as contentType",
        "visualApproach": "realistic|symbolic|diagrammatic|metaphorical|documentary",
        "entityMeaning": "What entities represent in this content type",
        "typicalBeats": ["list", "of", "common", "beats"]
    },
    "era": "Time period or setting type (if applicable, else 'modern' or 'timeless')",
    "primarySetting": "Main location/environment/context",
    "tone": "Overall mood/atmosphere",
    "globalEraConstraints": {
        "era": "medieval|ww2|modern|ancient|futuristic|etc",
        "allowedWeapons": ["sword", "spear", "bow"],
        "prohibitedItems": ["gun", "car", "phone", "computer"],
        "technologyLevel": "prehistoric|ancient|medieval|industrial|modern|futuristic"
    },
    "entities": [
        {
            "id": "unique_snake_case_id",
            "type": "character|location|object|animal|concept|event|step|feature|benefit|symbol|data|comparison",
            "name": "Display Name",
            "description": "Detailed visual description for image generation",
            "visualAnchor": "FIXED immutable visual traits that MUST appear in every query",
            "eraConstraints": null,
            "importance": "primary|secondary|background",
            "firstMention": 0,           // ← SEGMENT INDEX (0 to N-1). If 238 segments → valid: 0-237
            "mentions": ["0-5", "8-12"], // ← SEGMENT INDICES. MUST be within [0, N-1]. "0-500" when N=238 is WRONG!
            "groupId": "optional_group_id (for characters in factions)",
            "uniqueTraits": "traits specific to this entity",
            "role": "leader|soldier|civilian|background (for characters)"
        }
    ],
    "groups": [
        {
            "id": "group_id",
            "name": "Group Name",
            "visualAnchor": "Shared appearance for ALL members",
            "memberIds": ["member_1", "member_2-member_10"],
            "allegiance": "protagonist|antagonist|neutral"
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
            "mood": "Tone of this section"
        }
    ],
    "narrativeArc": {
        "beats": [
            {
                "segmentIndex": 0,
                "beatType": "establishing|action|emotional|dialogue|tension|climax|resolution|transition|introduction|explanation|example|demonstration|comparison|summary|context|evidence|testimony|showcase|benefit|use-case",
                "importance": "high|medium|low",
                "suggestedFocus": "character|object|setting|action|group|concept"
            }
        ]
    }
}

## CRITICAL RULES (INSTANT FAIL IF VIOLATED)

1. **SEGMENT INDICES, NOT MILLISECONDS**: firstMention and mentions[] MUST use segment indices (0 to N-1). If transcript has 238 segments, valid values are 0-237. Values like 172650 are WRONG.

2. **BOUNDS CHECK**: All segment indices MUST be within [0, N-1] where N = segment count.
   - 238 segments → valid range: 0-237
   - CORRECT: ["0-50", "60-100", "150-237"] (gaps show entity is ABSENT in segments 51-59, 101-149)
   - WRONG: ["0-500"] when N=238 (500 > 237 is out of bounds)
   - Any value >= N will be REJECTED

3. **VISUAL COHERENCE**: Entities must have VISUAL descriptions. NO abstraction.
   - "A mysterious man" → WRONG
   - "A man in a shadowed fedora with a jagged scar over his left eye" → RIGHT

4. **ANTI-PATTERNS (DO NOT DO THESE)**:
   - DO NOT list "The Narrator" as a character unless they are VISUALLY present on screen.
   - DO NOT invent "Locations" that aren't mentioned or clearly implied.
   - DO NOT use generic descriptions for Primary Entities. Every Main Character needs a distinct look.

5. **NEVER TRUNCATE**: Output the COMPLETE JSON. Prioritize PRIMARY entities over BACKGROUND ones if space is limited.

6. **NO LAZINESS**: Every entity MUST have a detailed visualAnchor.

7. **USE RANGE NOTATION**: For mentions[], use compact ranges. Gaps indicate segments where entity is NOT present.
   - ["0-237"] = entity appears in ALL segments (continuous)
   - ["0-50", "80-120", "200-237"] = entity ABSENT in segments 51-79 and 121-199

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
        // Include context/description for everyone, not just primary
        if (e.description && e.description !== e.visualAnchor) {
            entitySection += `CONTEXT: ${e.description}\n`;
        }
        if (e.eraConstraints) {
            entitySection += `CONSTRAINTS: Allowed [${e.eraConstraints.allowedWeapons.join(', ')}], Prohibited [${e.eraConstraints.prohibitedItems.join(', ')}]\n`;
        }
        entitySection += '\n';
    }

    // Build scene section
    let sceneSection = '== CURRENT SCENE ==\n';
    let currentSceneId = '';

    if (relevantScenes.length > 0) {
        const scene = relevantScenes[0];
        if (scene) {
            currentSceneId = scene.id;
            sceneSection += `Name: ${scene.name}\n`;
            sceneSection += `Setting: ${scene.setting}\n`;
            sceneSection += `Mood: ${scene.mood}\n`;
            sceneSection += `Segments: ${scene.segmentRange[0] + 1}-${scene.segmentRange[1] + 1}\n`;
        }
    }
    sceneSection += '\n';

    let stateSection = '';

    // DETECT SCENE CUT
    // batchState.currentScene holds the scene ID from the PREVIOUS batch
    const isNewScene = batchState && batchState.currentScene !== currentSceneId;

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

    // Build instruction section
    const instructionSection = `== INSTRUCTION (CRITICAL) ==
    Generate image queries for segments ${currentSegments[0] + 1}-${currentSegments[1] + 1}.

MANDATORY RULES:
1. NEVER use shorthand like "the Viking", "the bridge", "the axe", "the spear"
2. ALWAYS copy-paste the FULL description from the ESTABLISHED ENTITIES above
3. Each query must be a COMPLETE, SELF-CONTAINED visual description
4. Include ALL identifying details: weapons, clothing, location names, physical features

Example: Instead of "The Viking on the bridge", write:
"The lone, bare-chested Viking warrior, muscular and battle-hardened, wielding a massive Dane axe, standing on the narrow wooden Stamford Bridge spanning the River Derwent"
`;

    return `${entitySection}${sceneSection}${stateSection}${instructionSection}`;
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
        if (!parsed.era) parsed.era = '';
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
                typicalBeats: ['establishing', 'action', 'resolution'],
            };
        }

        if (!parsed.globalEraConstraints) {
            parsed.globalEraConstraints = {
                ...DEFAULT_ERA_CONSTRAINTS,
                era: parsed.era || 'unspecified',
            };
        }

        if (!parsed.groups || !Array.isArray(parsed.groups)) {
            parsed.groups = [];
        }
        parsed.groups = parsed.groups.map((group) => ({
            ...group,
            memberIds: expandMemberIds(group.memberIds),
        }));

        if (!parsed.narrativeArc || !parsed.narrativeArc.beats) {
            parsed.narrativeArc = { beats: [] };
        }

        parsed.entities = parsed.entities.map((entity) => ({
            ...entity,
            visualAnchor: entity.visualAnchor || entity.description || '',
            eraConstraints: entity.eraConstraints ?? null,
            mentions: expandMentionRanges(entity.mentions, segmentCount),
            firstMention: validateSegmentIndex(entity.firstMention, segmentCount),
        }));

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
