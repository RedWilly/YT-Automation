/**
 * Story Context Extraction Service
 * Extracts entities (characters, locations, objects, etc.) and scenes from transcripts
 * Enables context-aware query generation across batches
 */

import { getAIConfig } from '../../config/environment.ts';
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
    return `You are a script analyst specializing in visual storytelling. Your task is to analyze a transcript and extract structured information about entities, scenes, and narrative flow.

# TASK
Analyze the transcript and extract:
1. ENTITIES: All characters, locations, objects, animals, concepts, or groups that appear
2. SCENES: How segments group together into coherent scenes
3. METADATA: Era, setting, tone, summary

# ENTITY EXTRACTION RULES
- Each entity needs a clear VISUAL DESCRIPTION (for image generation)
- Identify explicit mentions AND implicit references ("he", "it", "the warrior" → entity ID)
- Rate importance: primary (main focus), secondary (supporting), background (minor)
- Track which segments mention each entity

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
    "entities": [
        {
            "id": "unique_snake_case_id",
            "type": "character|location|object|animal|concept|group",
            "name": "Display Name",
            "description": "Detailed visual description for image generation",
            "importance": "primary|secondary|background",
            "firstMention": 0,
            "mentions": [0, 5, 10]
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

CRITICAL: Return ONLY valid JSON. No markdown, no explanations.`;
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

    // Get entity IDs from relevant scenes
    const relevantEntityIds = new Set<string>();
    for (const scene of relevantScenes) {
        for (const id of scene.primaryEntities) relevantEntityIds.add(id);
        for (const id of scene.secondaryEntities) relevantEntityIds.add(id);
    }

    // Always include primary entities
    for (const entity of context.entities) {
        if (entity.importance === 'primary') {
            relevantEntityIds.add(entity.id);
        }
    }

    // Filter to relevant entities
    const relevantEntities = context.entities.filter(e => relevantEntityIds.has(e.id));

    // Build entity section
    const primaryEntities = relevantEntities.filter(e => e.importance === 'primary');
    const secondaryEntities = relevantEntities.filter(e => e.importance !== 'primary');

    let entitySection = '== ESTABLISHED ENTITIES ==\n\n';

    if (primaryEntities.length > 0) {
        entitySection += '[PRIMARY]\n';
        for (const e of primaryEntities) {
            entitySection += `- ${e.id} (${e.type.toUpperCase()}): ${e.description}\n`;
        }
        entitySection += '\n';
    }

    if (secondaryEntities.length > 0) {
        entitySection += '[SECONDARY]\n';
        for (const e of secondaryEntities) {
            entitySection += `- ${e.id} (${e.type.toUpperCase()}): ${e.description}\n`;
        }
        entitySection += '\n';
    }

    // Build scene section
    let sceneSection = '== CURRENT SCENE ==\n';
    if (relevantScenes.length > 0) {
        const scene = relevantScenes[0];
        if (scene) {
            sceneSection += `Name: ${scene.name}\n`;
            sceneSection += `Setting: ${scene.setting}\n`;
            sceneSection += `Mood: ${scene.mood}\n`;
            sceneSection += `Segments: ${scene.segmentRange[0] + 1}-${scene.segmentRange[1] + 1}\n`;
        }
    }
    sceneSection += '\n';

    // Build state section (if we have previous batch info)
    let stateSection = '';
    if (batchState && batchState.batchIndex > 0) {
        stateSection = '== PREVIOUS STATE ==\n';
        if (batchState.lastQueries.length > 0) {
            stateSection += `Last query: ${batchState.lastQueries[batchState.lastQueries.length - 1]?.substring(0, 100) ?? ''}...\n`;
        }
        if (batchState.activeEntities.length > 0) {
            stateSection += `Active entities: ${batchState.activeEntities.join(', ')}\n`;
        }
        stateSection += `Mood: ${batchState.currentMood}\n`;
        stateSection += '\n';
    }

    // Build instruction section
    const instructionSection = `== INSTRUCTION ==
Generate image queries for segments ${currentSegments[0] + 1}-${currentSegments[1] + 1}.
When referencing entities, use their EXACT descriptions from above.
Maintain visual continuity with previous queries.
`;

    return `${entitySection}${sceneSection}${stateSection}${instructionSection}`;
}

// ============================================================================
// Extraction API
// ============================================================================

/**
 * Extract story context from a transcript using LLM
 * This is Phase 1 of the two-phase query generation process
 */
export async function extractStoryContext(
    transcript: string,
    segmentCount: number
): Promise<StoryContext> {
    const aiConfig = getAIConfig();

    logger.step('Context', 'Extracting story context from transcript');
    logger.log('Context', `Analyzing ${segmentCount} segments for entities and scenes`);

    const systemPrompt = buildExtractionSystemPrompt();
    const userPrompt = buildExtractionUserPrompt(transcript, segmentCount);

    // Call LLM for extraction
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
            temperature: 0.3, // Lower temperature for structured output
            max_tokens: aiConfig.maxTokens,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Context extraction API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json() as LLMResponse;
    const content = data.choices[0]?.message?.content;

    if (!content) {
        throw new Error('Empty response from context extraction');
    }

    // Parse the JSON response
    const context = parseStoryContext(content);

    logger.success(
        'Context',
        `Extracted ${context.entities.length} entities and ${context.scenes.length} scenes`
    );

    return context;
}

/**
 * Parse the LLM response into a StoryContext object
 */
function parseStoryContext(content: string): StoryContext {
    // Clean up the response (remove markdown code blocks if present)
    let cleaned = content.trim();
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
        const parsed = JSON.parse(cleaned) as StoryContext;

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

        return parsed;
    } catch (error) {
        logger.error('Context', 'Failed to parse context extraction response', error);
        // Return minimal valid context
        return {
            summary: '',
            era: '',
            primarySetting: '',
            tone: '',
            entities: [],
            scenes: [],
        };
    }
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
    // Keep last 5 queries for context
    const lastQueries = queries.slice(-5);

    return {
        batchIndex: previousState.batchIndex + 1,
        lastQueries,
        activeEntities,
        currentScene,
        currentMood,
    };
}
