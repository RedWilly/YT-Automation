/**
 * LLM Types - Single Source of Truth
 * All schema definitions used by LLM prompts and TypeScript validation
 */

// =============================================================================
// BEAT TYPES
// =============================================================================

export const BEAT_TYPES = [
  'establishing', 'action', 'emotional', 'dialogue', 'tension', 'climax', 'resolution', 'transition',
  'introduction', 'explanation', 'example', 'demonstration', 'comparison', 'summary',
  'context', 'evidence', 'testimony', 'analysis',
  'showcase', 'benefit', 'use-case',
  'symbol',
] as const;

export type BeatType = typeof BEAT_TYPES[number];
export const BEAT_TYPE_SCHEMA = BEAT_TYPES.map(b => `"${b}"`).join(' | ');

// =============================================================================
// COMPOSITIONS
// =============================================================================

export const COMPOSITIONS = [
  'extreme-wide', 'wide', 'medium', 'close-up', 'extreme-close-up', 'two-shot',
] as const;

export type Composition = typeof COMPOSITIONS[number];
export const COMPOSITION_SCHEMA = COMPOSITIONS.map(c => `"${c}"`).join(' | ');

// =============================================================================
// SHOT TYPES
// =============================================================================

/**
 * Shot type for natural editing - controls per-shot video effects
 * - pan: vertical pan up/down (random direction), uses 4:3 aspect ratio for headroom
 * - zoom: subtle zoom in/out (random direction), uses 16:9 aspect ratio
 * - static: no movement, uses 16:9 aspect ratio
 */
export const SHOT_TYPES = ['pan', 'zoom', 'static'] as const;
export type ShotType = typeof SHOT_TYPES[number];
export const SHOT_TYPE_SCHEMA = SHOT_TYPES.map(t => `"${t}"`).join(' | ');

// =============================================================================
// ENTITY TYPES
// =============================================================================

export const ENTITY_TYPES = [
  'character', 'group', 'location', 'object', 'animal',
  'concept', 'event', 'comparison', 'data', 'step',
  'feature', 'benefit', 'symbol',
] as const;

export type EntityType = typeof ENTITY_TYPES[number];

// =============================================================================
// CONTENT TYPES
// =============================================================================

export const CONTENT_TYPES = [
  'narrative', 'educational', 'documentary', 'product',
  'abstract', 'news', 'motivational', 'comparison',
] as const;

export type ContentType = typeof CONTENT_TYPES[number];

// =============================================================================
// VISUAL APPROACHES
// =============================================================================

export const VISUAL_APPROACHES = [
  'realistic', 'symbolic', 'diagrammatic', 'metaphorical', 'documentary',
] as const;

export type VisualApproach = typeof VISUAL_APPROACHES[number];

// =============================================================================
// TECHNOLOGY LEVELS
// =============================================================================

export const TECHNOLOGY_LEVELS = [
  'prehistoric', 'ancient', 'medieval', 'industrial', 'modern', 'futuristic',
] as const;

export type TechnologyLevel = typeof TECHNOLOGY_LEVELS[number];

// =============================================================================
// ENTITY IMPORTANCE
// =============================================================================

export const ENTITY_IMPORTANCE = ['primary', 'secondary', 'background'] as const;
export type EntityImportance = typeof ENTITY_IMPORTANCE[number];

// =============================================================================
// FOCUS TYPES
// =============================================================================

export const FOCUS_TYPES = ['character', 'object', 'setting', 'action', 'group', 'concept'] as const;
export type FocusType = typeof FOCUS_TYPES[number];

// =============================================================================
// IMAGE SEARCH QUERY
// =============================================================================

export interface ImageSearchQuery {
  start: number;
  end: number;
  query: string;
  /** Shot type for natural editing effects */
  type?: ShotType;
}

// =============================================================================
// LLM REQUEST/RESPONSE
// =============================================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// =============================================================================
// STRUCTURED SHOT (Phase 2 Output)
// =============================================================================

export interface StructuredShot {
  start: number;
  end: number;
  sceneId: string;
  beatType: BeatType;
  focus: {
    primary: string[];
    secondary: string[];
    exclude: string[];
  };
  action: string;
  composition: Composition | null;
  framingNote?: string;
  type: ShotType;
}

// =============================================================================
// ERA CONSTRAINTS
// =============================================================================

export interface EraConstraints {
  era: string;
  allowedWeapons: string[];
  prohibitedItems: string[];
  technologyLevel: TechnologyLevel;
}

// =============================================================================
// CONTENT STRATEGY
// =============================================================================

export interface ContentStrategy {
  type: ContentType;
  visualApproach: VisualApproach;
  entityMeaning: string;
  typicalBeats: BeatType[];
}

// =============================================================================
// GROUP
// =============================================================================

export interface Group {
  id: string;
  name: string;
  visualAnchor: string;
  memberIds: string[];
  allegiance?: 'protagonist' | 'antagonist' | 'neutral';
}

// =============================================================================
// NARRATIVE BEAT
// =============================================================================

export interface NarrativeBeat {
  segmentIndex: number;
  beatType: BeatType;
  importance: 'high' | 'medium' | 'low';
  suggestedFocus: FocusType;
}

export interface NarrativeArc {
  beats: NarrativeBeat[];
}

// =============================================================================
// ENTITY (Phase 1 Output)
// =============================================================================

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  description: string;
  importance: EntityImportance;
  firstMention: number;  // Segment INDEX (0 to N-1), NOT milliseconds
  mentions: number[];    // Array of segment INDICES, NOT timestamps
  visualAnchor: string;
  eraConstraints: EraConstraints | null;
  groupId?: string;
  uniqueTraits?: string;
  role?: 'leader' | 'soldier' | 'civilian' | 'background';
}

// =============================================================================
// SCENE
// =============================================================================

export interface Scene {
  id: string;
  name: string;
  description: string;
  segmentRange: [number, number];
  primaryEntities: string[];
  secondaryEntities: string[];
  setting: string;
  mood: string;
}

// =============================================================================
// STORY CONTEXT (Phase 1 Complete Output)
// =============================================================================

export interface StoryContext {
  summary: string;
  era: string;
  primarySetting: string;
  tone: string;
  contentType: ContentType;
  contentStrategy: ContentStrategy;
  entities: Entity[];
  groups: Group[];
  scenes: Scene[];
  globalEraConstraints: EraConstraints;
  narrativeArc: NarrativeArc;
}

// =============================================================================
// BATCH STATE (For Phase 2 Continuity)
// =============================================================================

export interface BatchState {
  batchIndex: number;
  lastQueries: string[];
  activeEntities: string[];
  currentScene: string;
  currentMood: string;
}
