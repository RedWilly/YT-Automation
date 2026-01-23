import type { StoryContext, StructuredShot } from '../../types/llm.ts';
import type { ResolvedStyle } from '../../styles/types.ts';

export type { StructuredShot } from '../../types/llm.ts';

/**
 * Entity reference pattern: [entity_id]
 * Matches bracketed identifiers that are NOT cameraAngle or shotScale
 */
const ENTITY_REF_PATTERN = /\[([a-z_][a-z0-9_]*)\]/gi;

/**
 * Camera angle pattern: [cameraAngle: X]
 */
const CAMERA_ANGLE_PATTERN = /\[cameraAngle:\s*([^\]]+)\]/gi;

/**
 * Shot scale pattern: [shotScale: X]
 */
const SHOT_SCALE_PATTERN = /\[shotScale:\s*([^\]]+)\]/gi;

/** Expand entity ID to Name(visualAnchor) format */
function expandEntityReference(entityId: string, context: StoryContext): string {
    const entity = context.entities.find(e => e.id === entityId);
    if (!entity) {
        // Entity not found - return as-is (might be inline description)
        return entityId;
    }

    // Get group visual anchor for non-leaders
    let groupAnchor: string | null = null;
    if (entity.groupId && entity.role !== 'leader') {
        groupAnchor = context.groups?.find(g => g.id === entity.groupId)?.visualAnchor ?? null;
    }

    // Build visual description: group anchor + entity anchor
    const visualParts = [groupAnchor, entity.visualAnchor].filter(Boolean);
    const visualAnchor = visualParts.join(', ');

    // Return Name(visualAnchor) format
    return visualAnchor ? `${entity.name}(${visualAnchor})` : entity.name;
}

/** Expand camera, shot scale, and entity references in action string */
function expandAction(action: string, context: StoryContext): string {
    let expanded = action;

    // Expand camera angles: [cameraAngle: High Angle] → High Angle
    expanded = expanded.replace(CAMERA_ANGLE_PATTERN, (_match, angle) => {
        return angle.trim();
    });

    // Expand shot scales: [shotScale: Wide Shot] → Wide Shot
    expanded = expanded.replace(SHOT_SCALE_PATTERN, (_match, scale) => {
        return scale.trim();
    });

    // Expand entity references: [screaming_slave] → Screaming Slave(visualAnchor)
    // Must be done after camera/shot patterns to avoid false matches
    expanded = expanded.replace(ENTITY_REF_PATTERN, (_match, entityId) => {
        // Skip if this looks like a camera or shot pattern (already handled)
        if (entityId.toLowerCase().startsWith('cameraangle') ||
            entityId.toLowerCase().startsWith('shotscale')) {
            return _match;
        }
        return expandEntityReference(entityId, context);
    });

    return expanded;
}

/**
 * Build image prompt from structured shot
 * 
 * Flow:
 * 1. Expand action string (entity refs, camera, shot scale)
 * 2. Append framing note if present
 * 3. Append scene mood and lighting for visual consistency
 */
export function buildImagePrompt(
    shot: StructuredShot,
    context: StoryContext,
    _style: ResolvedStyle,
    shotIndex?: number
): string {
    // Expand the action string with entity lookups
    let prompt = expandAction(shot.action, context);

    // Append framing note with period
    if (shot.framingNote) {
        if (!prompt.endsWith('.')) {
            prompt += '.';
        }
        prompt += ` ${shot.framingNote}`;
    }

    // Find the scene this shot belongs to and append mood/lighting
    if (shotIndex !== undefined) {
        const scene = context.scenes.find(s =>
            shotIndex >= s.segmentRange[0] && shotIndex <= s.segmentRange[1]
        );

        if (scene) {
            const sceneContext: string[] = [];

            if (scene.mood) {
                sceneContext.push(scene.mood);
            }
            if (scene.lightingCue) {
                sceneContext.push(scene.lightingCue);
            }

            if (sceneContext.length > 0) {
                if (!prompt.endsWith('.')) {
                    prompt += '.';
                }
                prompt += ` ${sceneContext.join('. ')}`;
            }
        }
    }

    // Ensure prompt ends with period
    if (!prompt.endsWith('.')) {
        prompt += '.';
    }

    // Add era-specific prohibited items
    const prohibitedItems = context.globalEraConstraints?.prohibitedItems;
    if (prohibitedItems && prohibitedItems.length > 0) {
        prompt += ` Avoid anachronisms: ${prohibitedItems.join(', ')}.`;
    }

    // Add negative instruction to avoid text/numbers in generated images
    prompt += ' Do not include any text, numbers, letters, watermarks, or written content.';

    // Clean up any double periods or spacing issues
    return prompt.replace(/\.\s*\./g, '.').replace(/,\s*\./g, '.').trim();
}

/** Generate a consistent seed based on shot content */
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return hash;
}

export function generateConsistentSeed(shot: StructuredShot, shotIndex: number): number {
    // Extract entity IDs from action for consistent seeding
    const entityMatches = shot.action.match(ENTITY_REF_PATTERN) || [];
    const entityIds = entityMatches
        .map(m => m.replace(/[\[\]]/g, ''))
        .filter(id => !id.toLowerCase().startsWith('cameraangle') &&
            !id.toLowerCase().startsWith('shotscale'))
        .sort();

    const seedBase = `${entityIds.join(',')}_${shotIndex}`;
    return Math.abs(hashCode(seedBase) + shotIndex) % 2147483647 || 1;
}
