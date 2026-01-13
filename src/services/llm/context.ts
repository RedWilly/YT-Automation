/**
 * Story Context Extraction Service
 * Extracts entities (characters, locations, objects, etc.) and scenes from transcripts
 * Enables context-aware query generation across batches
 */

import { getAIConfig } from '../../config/index.ts';
import type { LLMResponse } from '../../types/index.ts';
import * as logger from '../../utils/logger.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Entity types that can appear in a script
 */
export type EntityType = 'character' | 'location' | 'object' | 'animal' | 'concept' | 'group';

/**
 * Importance level for entities
 * - primary: Main focus of the story, appears frequently
 * - secondary: Supporting role, appears multiple times
 * - background: Mentioned once or twice, not central
 */
export type EntityImportance = 'primary' | 'secondary' | 'background';

/**
 * Era-appropriate constraints for consistency validation
 * Defines what items are allowed/prohibited in a given historical era
 */
export interface EraConstraints {
    /** Era identifier: "medieval", "ww2", "modern", "ancient", "futuristic", etc. */
    era: string;
    /** Weapons appropriate for this era */
    allowedWeapons: string[];
    /** Items that should NOT appear in this era (anachronisms) */
    prohibitedItems: string[];
    /** Technology level descriptor */
    technologyLevel: 'prehistoric' | 'ancient' | 'medieval' | 'industrial' | 'modern' | 'futuristic';
}

/**
 * An entity extracted from the transcript
 * Can be a character, location, object, animal, concept, or group
 */
export interface Entity {
    id: string;
    type: EntityType;
    name: string;
    description: string;  // Visual description for image generation
    importance: EntityImportance;
    firstMention: number; // Segment index where first mentioned
    mentions: number[];   // All segment indices that reference this entity
    /** 
     * Immutable visual traits that MUST appear in every query mentioning this entity.
     * This is the "anchor" description that ensures visual consistency across segments.
     * Example: "6'2\" Viking warrior with braided red beard, bare-chested, wielding a massive Dane axe"
     */
    visualAnchor: string;
    /**
     * Era-specific constraints for this entity (optional, overrides global)
     * Use for entities that don't fit the main era (e.g., a time traveler)
     */
    eraConstraints: EraConstraints | null;
}

/**
 * A scene groups related segments together
 * Segments in a scene share the same location/context
 */
export interface Scene {
    id: string;
    name: string;
    description: string;
    segmentRange: [number, number]; // [start, end] indices
    primaryEntities: string[];      // Entity IDs that are main focus
    secondaryEntities: string[];    // Entity IDs in supporting role
    setting: string;                // Where/when this happens
    mood: string;                   // Tone/atmosphere
}

/**
 * Complete story context extracted from transcript
 * Used to maintain consistency across batched query generation
 */
export interface StoryContext {
    // Overall story metadata
    summary: string;
    era: string;
    primarySetting: string;
    tone: string;

    // Entity registry
    entities: Entity[];

    // Scene graph
    scenes: Scene[];

    /**
     * Global era constraints for the entire story
     * Used by verifier to detect anachronistic items
     */
    globalEraConstraints: EraConstraints;
}

/**
 * State passed between batches for continuity
 */
export interface BatchState {
    batchIndex: number;
    lastQueries: string[];     // Last N queries from previous batch
    activeEntities: string[];  // Entity IDs that were on screen
    currentScene: string;      // Scene ID
    currentMood: string;       // Current mood/atmosphere
}

// ============================================================================
// Extraction Prompt
// ============================================================================

/**
 * Build the system prompt for context extraction
 */
export function buildExtractionSystemPrompt(): string {
    return `You are a script analyst specializing in visual storytelling. Your task is to analyze a transcript and extract structured information about entities, scenes, narrative flow, and era-appropriate constraints.

# TASK
Analyze the transcript and extract:
1. ENTITIES: All characters, locations, objects, animals, concepts, or groups that appear
2. SCENES: How segments group together into coherent scenes
3. METADATA: Era, setting, tone, summary
4. ERA CONSTRAINTS: What items are appropriate/prohibited for this era

# ENTITY EXTRACTION RULES
- Each entity needs a clear VISUAL DESCRIPTION (for image generation)
- Each entity MUST have a VISUAL ANCHOR: the immutable visual traits that define this entity
  - Visual anchor is a FIXED, DETAILED description that MUST appear in EVERY image query mentioning this entity
  - Example: "6'2\" Viking warrior with braided red beard, blue war paint on face, bare-chested, wielding a massive Dane axe with a 6-foot ash wood handle"
- Identify explicit mentions AND implicit references ("he", "it", "the warrior" → entity ID)
- Rate importance: primary (main focus), secondary (supporting), background (minor)
- Track which segments mention each entity using RANGE NOTATION to save space:
  - Consecutive segments: "0-22" instead of [0,1,2,3,...,22]
  - Gaps: ["0-5", "10-15"] for segments 0-5 and 10-15
  - Single: ["7"] for just segment 7

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
    "summary": "Brief overview of the story",
    "era": "Time period or setting type",
    "primarySetting": "Main location/environment",
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
            "type": "character|location|object|animal|concept|group",
            "name": "Display Name",
            "description": "Detailed visual description for image generation",
            "visualAnchor": "FIXED immutable visual traits that MUST appear in every query",
            "eraConstraints": null,
            "importance": "primary|secondary|background",
            "firstMention": 0,
            "mentions": ["0-5", "8-12"]
        }
    ],
    "scenes": [
        {
            "id": "scene_id",
            "name": "Scene Name",
            "description": "What happens in this scene",
            "segmentRange": [0, 15],
            "primaryEntities": ["entity_id1"],
            "secondaryEntities": ["entity_id2"],
            "setting": "Where/when this happens",
            "mood": "Tone of this scene"
        }
    ]
}

## CRITICAL RULES (INSTANT FAIL IF VIOLATED)

1. **NEVER TRUNCATE**: Output the COMPLETE JSON or nothing. Do not cut off arrays mid-way. If you cannot fit everything, prioritize PRIMARY entities over BACKGROUND ones.

2. **NO LAZINESS**: Every entity MUST have a detailed visualAnchor. Do not write "a soldier" — write "a 25-year-old soldier with short brown hair, wearing a mud-stained olive drab uniform, carrying an M1 Garand rifle".

3. **USE RANGE NOTATION**: For mentions[], use compact ranges like ["0-22", "25-30"] instead of listing every number. Never truncate ranges mid-way.

4. **VALID JSON ONLY**: No markdown code blocks. No explanations. No trailing commas. Just raw, parseable JSON.

Return ONLY valid JSON.`;
}

/**
 * Build the user prompt for context extraction
 */
export function buildExtractionUserPrompt(transcript: string, segmentCount: number): string {
    return `# TRANSCRIPT (${segmentCount} segments)
${transcript}

# EXECUTE
1. READ the entire transcript carefully
2. IDENTIFY all entities (characters, locations, objects, animals, concepts, groups)
3. GROUP segments into scenes based on location/context changes
4. EXTRACT metadata (era, setting, tone)
5. RETURN structured JSON

Return ONLY valid JSON.`;
}

// ============================================================================
// Context Injection for Query Generation
// ============================================================================

/**
 * Build the context section to inject into query generation prompts
 * This provides the LLM with entity definitions and scene information
 */
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

    // Build state section (continuity OR transition)
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

/**
 * Extract story context from a transcript using LLM
 * This is Phase 1 of the two-phase query generation process
 * Retries up to 3 times on failure before throwing
 */
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
                userPrompt
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

/**
 * Single attempt at context extraction
 */
async function attemptContextExtraction(
    aiConfig: ReturnType<typeof getAIConfig>,
    systemPrompt: string,
    userPrompt: string
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

    return parseStoryContext(content);
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

/**
 * Parse the LLM response into a StoryContext object
 */
function parseStoryContext(content: string): StoryContext {
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

        // Ensure globalEraConstraints exists with defaults
        if (!parsed.globalEraConstraints) {
            parsed.globalEraConstraints = {
                ...DEFAULT_ERA_CONSTRAINTS,
                era: parsed.era || 'unspecified',
            };
        }

        // Ensure each entity has visualAnchor, eraConstraints, and expanded mentions
        parsed.entities = parsed.entities.map((entity) => ({
            ...entity,
            visualAnchor: entity.visualAnchor || entity.description || '',
            eraConstraints: entity.eraConstraints ?? null,
            mentions: expandMentionRanges(entity.mentions),
        }));

        return parsed as StoryContext;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Context', `Failed to parse context extraction response: ${errorMsg}`);
        throw new Error(`Failed to parse context JSON: ${errorMsg}`);
    }
}

/**
 * Expand mention ranges from compact notation to full arrays
 * Handles: ["0-5", "10-15"] → [0,1,2,3,4,5,10,11,12,13,14,15]
 * Also handles: [0, 1, 2] (already expanded) or ["7"] (single)
 */
function expandMentionRanges(mentions: unknown): number[] {
    if (!mentions || !Array.isArray(mentions)) {
        return [];
    }

    const result: number[] = [];

    for (const item of mentions) {
        if (typeof item === 'number') {
            // Already a number, just add it
            result.push(item);
        } else if (typeof item === 'string') {
            // Could be "5" or "0-22"
            if (item.includes('-')) {
                const [startStr, endStr] = item.split('-');
                const start = parseInt(startStr ?? '', 10);
                const end = parseInt(endStr ?? '', 10);
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    for (let i = start; i <= end; i++) {
                        result.push(i);
                    }
                }
            } else {
                const num = parseInt(item, 10);
                if (!isNaN(num)) {
                    result.push(num);
                }
            }
        }
    }

    return result;
}

/**
 * Create initial batch state for the first batch
 */
export function createInitialBatchState(): BatchState {
    return {
        batchIndex: 0,
        lastQueries: [],
        activeEntities: [],
        currentScene: '',
        currentMood: '',
    };
}

/**
 * Update batch state after processing a batch
 */
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
