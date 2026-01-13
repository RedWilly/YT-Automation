/**
 * Structured Shot Builder
 * Composes SDXL prompts deterministically from structured shot metadata
 * Ensures visual anchors are used verbatim for consistency
 */

import type { StoryContext, Entity, Scene } from './context.ts';
import type { ResolvedStyle } from '../../styles/types.ts';

/**
 * Structured shot metadata output by LLM
 * Contains WHAT is in the scene, not HOW to describe it
 */
export interface StructuredShot {
    start: number;
    end: number;
    sceneId: string;
    presentEntities: string[];  // Entity IDs present in frame
    focusEntities: string[];    // Entity IDs for close-up/focus
    action: string;             // What's happening (no visual descriptions)
    composition?: string;       // Optional: framing guidance (wide, close-up, etc.)
    type: 'pan' | 'zoom' | 'static';
    linkedTo: number | null;
}

/**
 * Build a deterministic SDXL prompt from structured shot metadata
 * This ensures visual anchors are used EXACTLY as defined
 */
export function buildImagePrompt(
    shot: StructuredShot,
    context: StoryContext,
    style: ResolvedStyle
): string {
    // 1. Find the scene
    const scene = context.scenes.find(s => s.id === shot.sceneId);
    
    // 2. Get entities with their EXACT visual anchors
    const presentEntities = context.entities.filter(
        e => shot.presentEntities.includes(e.id)
    );
    const focusEntities = context.entities.filter(
        e => shot.focusEntities.includes(e.id)
    );
    
    // 3. Build scene backbone (setting + mood + era)
    const sceneBackdrop = buildSceneBackdrop(scene, context);
    
    // 4. Build entity descriptions using EXACT visual anchors
    const entityDescriptions = buildEntityDescriptions(
        presentEntities, 
        focusEntities,
        shot.action
    );
    
    // 5. Build composition guidance
    const compositionText = shot.composition 
        ? `${shot.composition} shot,` 
        : '';
    
    // 6. Compose final prompt (order matters for SDXL attention)
    const promptParts = [
        compositionText,
        sceneBackdrop,
        entityDescriptions,
        shot.action,
    ].filter(Boolean);
    
    return promptParts.join(' ').trim();
}

/**
 * Build consistent scene backdrop from scene data
 */
function buildSceneBackdrop(
    scene: Scene | undefined, 
    context: StoryContext
): string {
    if (!scene) {
        // Fallback to global context
        return [
            context.primarySetting,
            context.tone,
            context.era,
        ].filter(Boolean).join(', ');
    }
    
    return [
        scene.setting,
        scene.mood,
        context.era,
    ].filter(Boolean).join(', ');
}

/**
 * Build entity descriptions with EXACT visual anchors
 * Focus entities get more prominence
 */
function buildEntityDescriptions(
    presentEntities: Entity[],
    focusEntities: Entity[],
    action: string
): string {
    const descriptions: string[] = [];
    
    // Focus entities first (more prominent in SDXL attention)
    for (const entity of focusEntities) {
        if (entity.visualAnchor) {
            descriptions.push(entity.visualAnchor);
        }
    }
    
    // Then other present entities (not already in focus)
    const focusIds = new Set(focusEntities.map(e => e.id));
    for (const entity of presentEntities) {
        if (!focusIds.has(entity.id) && entity.visualAnchor) {
            descriptions.push(entity.visualAnchor);
        }
    }
    
    return descriptions.join(', ');
}

/**
 * Generate a deterministic seed from scene and entity IDs
 * Ensures visual consistency across shots in the same scene
 */
export function generateConsistentSeed(
    shot: StructuredShot,
    shotIndex: number
): number {
    const seedBase = `${shot.sceneId}_${shot.presentEntities.sort().join(',')}`;
    const hash = hashCode(seedBase);
    // Add shot index for variation while maintaining base consistency
    return Math.abs(hash + shotIndex);
}

/**
 * Simple string hash function for seed generation
 */
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
}

/**
 * Convert legacy ImageSearchQuery to StructuredShot format
 * Used for backward compatibility during migration
 */
export function legacyQueryToStructuredShot(
    query: { start: number; end: number; query: string; type?: string; linkedTo?: number | null },
    index: number
): StructuredShot {
    return {
        start: query.start,
        end: query.end,
        sceneId: 'default',
        presentEntities: [],
        focusEntities: [],
        action: query.query,
        type: (query.type as 'pan' | 'zoom' | 'static') || 'pan',
        linkedTo: query.linkedTo ?? null,
    };
}
