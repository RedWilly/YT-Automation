/**
 * LLM Types - Single Source of Truth
 * All schema definitions used by LLM prompts and TypeScript validation
 */



// =============================================================================
// CAMERA ANGLES
// =============================================================================

export const CAMERA_ANGLES = {
  'Eye Level': 'eye-level shot',
  'Low Angle': 'low angle shot, looking up',
  'High Angle': 'high angle shot, looking down',
  "Bird's Eye": "bird's eye view, top-down shot",
  'Dutch Angle': 'Dutch angle shot, tilted horizon',
  'Over Shoulder': 'over-the-shoulder shot',
} as const;

export type CameraAngle = keyof typeof CAMERA_ANGLES;
export const CAMERA_ANGLE_KEYS = Object.keys(CAMERA_ANGLES) as CameraAngle[];
export const CAMERA_ANGLE_SCHEMA = CAMERA_ANGLE_KEYS.map(a => `"${a}"`).join(' | ');

// =============================================================================
// SHOT SCALES (Framing/Composition)
// =============================================================================

export const SHOT_SCALES = {
  'Wide Shot': 'wide shot',
  'Medium Shot': 'medium shot',
  'Close-Up': 'close-up shot',
  'Extreme Close-Up': 'extreme close-up',
} as const;

export type ShotScale = keyof typeof SHOT_SCALES;
export const SHOT_SCALE_KEYS = Object.keys(SHOT_SCALES) as ShotScale[];
export const SHOT_SCALE_SCHEMA = SHOT_SCALE_KEYS.map(s => `"${s}"`).join(' | ');

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
export const ENTITY_TYPE_SCHEMA = ENTITY_TYPES.map(t => `"${t}"`).join(' | ');

// =============================================================================
// CONTENT TYPES
// =============================================================================

export const CONTENT_TYPES = [
  'narrative', 'educational', 'documentary', 'product',
  'abstract', 'news', 'motivational', 'comparison',
] as const;

export type ContentType = typeof CONTENT_TYPES[number];
export const CONTENT_TYPE_SCHEMA = CONTENT_TYPES.map(t => `"${t}"`).join(' | ');

// =============================================================================
// VISUAL APPROACHES
// =============================================================================

export const VISUAL_APPROACHES = [
  'realistic', 'symbolic', 'diagrammatic', 'metaphorical', 'documentary',
] as const;

export type VisualApproach = typeof VISUAL_APPROACHES[number];
export const VISUAL_APPROACH_SCHEMA = VISUAL_APPROACHES.map(t => `"${t}"`).join(' | ');

// =============================================================================
// TECHNOLOGY LEVELS
// =============================================================================

export const TECHNOLOGY_LEVELS = [
  'prehistoric', 'ancient', 'medieval', 'industrial', 'modern', 'futuristic',
] as const;

export type TechnologyLevel = typeof TECHNOLOGY_LEVELS[number];
export const TECHNOLOGY_LEVEL_SCHEMA = TECHNOLOGY_LEVELS.map(t => `"${t}"`).join(' | ');

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

/**
 * New unified shot format with natural language action field.
 * 
 * The action field uses bracket notation to embed:
 * - Entity references: [entity_id] → expanded to Name(visualAnchor)
 * - Camera angle: [cameraAngle: X] → expanded to X
 * - Shot scale: [shotScale: Y] → expanded to Y
 * 
 * Example action:
 * "A [cameraAngle: High Angle] [shotScale: Wide Shot] of [screaming_slave] dangling over the murky [eel_pools]"
 * 
 * Transforms to:
 * "A High Angle, Wide Shot of Screaming Slave(olive skin, muscular...) dangling over the murky Eel Pools(rectangular pools...)"
 */
export interface StructuredShot {
  start: number;
  end: number;
  /** 
   * Natural language action with embedded references using bracket notation:
   * - [entity_id] for entity references
   * - [cameraAngle: X] for camera angle
   * - [shotScale: Y] for shot scale
   */
  action: string;
  /** Optional specific framing guidance - appended to final prompt */
  framingNote?: string;
  /** Shot type for video effects: pan, zoom, static */
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
}

// =============================================================================
// GROUP
// =============================================================================

export interface Group {
  id: string;
  name: string;
  visualAnchor: string;
  memberIds: string[];
}

// =============================================================================
// ENTITY (Phase 1 Output)
// =============================================================================

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  importance: EntityImportance;
  mentions: number[];    // Array of segment INDICES, NOT timestamps
  /**
   * PROMPT-READY visual description ONLY.
   * Must include: era-appropriate clothing/gear/materials/colors/textures/silhouette.
   * Must NOT include: narrative, events, time progression, story beats.
   * This is the SOLE visual source for image prompt building.
   */
  visualAnchor: string;
  eraConstraints: EraConstraints | null;
  groupId?: string;
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
  /** Director's visual tone: "claustrophobic", "expansive", "intimate", etc. */
  visualTone?: string;
  /** Power dynamics: Who dominates space? Who is vulnerable? */
  powerDynamic?: string;
  /** Symbolic objects/props that carry emotional weight in this scene */
  keyProps?: string[];
  /** Lighting direction: "harsh shadows", "soft warmth", "silhouette", etc. */
  lightingCue?: string;
}

// =============================================================================
// STORY CONTEXT (Phase 1 Complete Output)
// =============================================================================

export interface StoryContext {
  summary: string;
  primarySetting: string;
  tone: string;
  contentType: ContentType;
  contentStrategy: ContentStrategy;
  entities: Entity[];
  groups: Group[];
  scenes: Scene[];
  /** Canonical era constraints - single source of truth for era/period */
  globalEraConstraints: EraConstraints;
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
