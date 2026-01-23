import type { StoryContext, Scene, StructuredShot, CameraAngle, ShotScale } from '../../types/llm.ts';
import { CAMERA_ANGLES, SHOT_SCALES } from '../../types/llm.ts';
import type { ResolvedStyle } from '../../styles/types.ts';

export type { StructuredShot } from '../../types/llm.ts';

/**
 * Build camera framing prefix from angle and scale
 * Combines both to create natural prompt prefix like "Low angle, close-up shot:"
 */
function getCameraFramingPrefix(
    cameraAngle: CameraAngle | null,
    shotScale: ShotScale | null
): string {
    const parts: string[] = [];
    
    if (cameraAngle && CAMERA_ANGLES[cameraAngle]) {
        parts.push(CAMERA_ANGLES[cameraAngle]);
    }
    if (shotScale && SHOT_SCALES[shotScale]) {
        parts.push(SHOT_SCALES[shotScale]);
    }
    
    if (parts.length === 0) return '';
    
    // Capitalize first letter and add colon
    const combined = parts.join(', ');
    return combined.charAt(0).toUpperCase() + combined.slice(1) + ':';
}

/**
 * Build entity description with role-aware group handling
 * - Leaders (role: 'leader'): Use only their unique appearance, skip group anchor
 * - Non-leaders: Always include group anchor for visual consistency
 */
function buildEntityDescription(
    entityId: string, 
    context: StoryContext, 
    detail: 'visual-only' | 'brief-visual'
): string {
    const entity = context.entities.find(e => e.id === entityId);
    if (!entity) return '';

    // Leaders have distinct appearances — don't inherit group visuals
    const isLeader = entity.role === 'leader';
    
    // Get group visual anchor (only for non-leaders)
    let groupAnchor: string | null = null;
    if (entity.groupId && !isLeader) {
        groupAnchor = context.groups?.find(g => g.id === entity.groupId)?.visualAnchor ?? null;
    }

    // Build visual parts: group anchor + entity anchor
    const visualParts = [groupAnchor, entity.visualAnchor].filter(Boolean);

    // 'visual-only': Full visual description for primary subjects
    if (detail === 'visual-only') {
        return visualParts.join(', ') || '';
    }
    
    // 'brief-visual': Name + (visual description) for secondary elements
    if (detail === 'brief-visual') {
        const visual = visualParts.join(', ');
        return visual ? `${entity.name} (${visual})` : entity.name;
    }

    return '';
}

/**
 * Resolve effective focus from shot + scene inheritance
 * - emphasis: What LLM wants to focus on (becomes primary)
 * - exclude: What to hide from this shot
 * - secondary: Scene's other primaryEntities (auto-inherited, minus emphasis & exclude)
 */
function resolveSceneFocus(
    shot: StructuredShot,
    scene: Scene | undefined,
    context: StoryContext
): { primary: string[]; secondary: string[]; exclude: string[] } {
    const emphasis = shot.focus.emphasis || [];
    const exclude = new Set(shot.focus.exclude || []);
    
    // Get scene's primary and secondary entities
    const scenePrimary = scene?.primaryEntities || [];
    const sceneSecondary = scene?.secondaryEntities || [];
    
    // Primary = LLM's emphasis (what to focus on)
    const primary = emphasis.filter(id => !exclude.has(id));
    
    // Secondary = scene's primary entities (minus emphasis, minus exclude)
    // Plus scene's secondary entities (minus exclude)
    const emphasisSet = new Set(emphasis);
    const secondary = [
        ...scenePrimary.filter(id => !emphasisSet.has(id) && !exclude.has(id)),
        ...sceneSecondary.filter(id => !emphasisSet.has(id) && !exclude.has(id))
    ];
    
    return {
        primary,
        secondary,
        exclude: Array.from(exclude)
    };
}

/**
 * Build the setting description from scene
 * Prioritizes location entities, falls back to scene.setting
 */
function buildSettingDescription(scene: Scene | undefined, context: StoryContext): string {
    if (!scene) return context.primarySetting || '';
    
    // Find location entity in scene's primary entities
    const locationEntity = scene.primaryEntities
        ?.map(id => context.entities.find(e => e.id === id))
        .find(e => e?.type === 'location');
    
    if (locationEntity) {
        return locationEntity.visualAnchor;
    }
    
    return scene.setting || context.primarySetting || '';
}

/**
 * Build atmosphere/lighting from scene context
 */
function buildAtmosphere(scene: Scene | undefined, context: StoryContext): string {
    if (scene?.lightingCue) return scene.lightingCue;
    if (scene?.mood) return scene.mood;
    return context.tone || '';
}

/**
 * Build image prompt from structured shot + scene inheritance
 * 
 * NEW FLOW:
 * 1. Get scene from sceneId
 * 2. Resolve focus: emphasis → primary, scene entities → secondary (auto-inherited)
 * 3. Build prompt with scene's setting, mood, lighting, keyProps
 * 4. Apply exclusions
 */
export function buildImagePrompt(
    shot: StructuredShot, 
    context: StoryContext, 
    _style: ResolvedStyle
): string {
    const scene = context.scenes.find(s => s.id === shot.sceneId);
    
    // Resolve effective focus (inherits from scene)
    const resolvedFocus = resolveSceneFocus(shot, scene, context);
    
    // Camera framing prefix
    const cameraFramingPrefix = getCameraFramingPrefix(shot.cameraAngle, shot.shotScale);
    
    // Build primary subjects (emphasis entities)
    const primarySubjects = resolvedFocus.primary
        .map(id => {
            const entity = context.entities.find(e => e.id === id);
            // For locations, we'll use in setting instead
            if (entity?.type === 'location') return null;
            return buildEntityDescription(id, context, 'visual-only');
        })
        .filter(Boolean);

    // Build subject-action combo
    const actionPhrase = shot.action;
    let coreDescription = actionPhrase;
    
    if (primarySubjects.length > 0) {
        // If action doesn't already mention the subjects, prepend them
        const subjectsMentioned = primarySubjects.some(subj => 
            subj && actionPhrase.toLowerCase().includes(subj.toLowerCase().split(',')[0] ?? '')
        );
        
        if (!subjectsMentioned) {
            coreDescription = `${primarySubjects.join(' and ')} ${actionPhrase}`;
        }
    }

    // Build setting context
    const settingParts: string[] = [];
    
    // Check if a location is emphasized
    const emphasizedLocation = resolvedFocus.primary.find(id => {
        const entity = context.entities.find(e => e.id === id);
        return entity?.type === 'location';
    });
    
    if (emphasizedLocation) {
        // Use emphasized location as primary setting
        const locDesc = buildEntityDescription(emphasizedLocation, context, 'visual-only');
        if (locDesc) settingParts.push(locDesc);
    } else {
        // Auto-include setting from scene
        const settingDesc = buildSettingDescription(scene, context);
        if (settingDesc) settingParts.push(settingDesc);
    }

    // Add secondary elements as background/context (auto-inherited from scene)
    const secondaryElements = resolvedFocus.secondary
        .map(id => {
            const entity = context.entities.find(e => e.id === id);
            // Skip locations in secondary (already in setting)
            if (entity?.type === 'location') return null;
            return buildEntityDescription(id, context, 'brief-visual');
        })
        .filter(Boolean);
    
    if (secondaryElements.length > 0) {
        settingParts.push(`${secondaryElements.join(', ')} visible in scene`);
    }

    // Build atmosphere/lighting (from scene)
    const atmosphere = buildAtmosphere(scene, context);
    
    // Add key props from scene (symbolic objects)
    const excludeSet = new Set(resolvedFocus.exclude);
    const visibleKeyProps = scene?.keyProps?.filter(prop => !excludeSet.has(prop)) || [];
    const keyPropsText = visibleKeyProps.length > 0
        ? `featuring ${visibleKeyProps.join(', ')}`
        : null;
    
    // Scene's visual tone and power dynamic
    const visualTone = scene?.visualTone || null;
    const powerDynamic = scene?.powerDynamic || null;
    
    // Era constraints
    const eraConstraints = context.globalEraConstraints;
    const eraLabel = eraConstraints?.era || null;
    const techLevel = eraConstraints?.technologyLevel || null;
    const prohibitedItems = eraConstraints?.prohibitedItems?.length
        ? `Avoid anachronisms: ${eraConstraints.prohibitedItems.join(', ')}`
        : null;

    // Assemble in natural reading order
    const parts = [
        cameraFramingPrefix,
        coreDescription,
        keyPropsText,
        settingParts.length > 0 ? settingParts.join('. ') : null,
        visualTone,
        powerDynamic,
        atmosphere,
        shot.framingNote || null,
        eraLabel,
        techLevel ? `Technology: ${techLevel}` : null,
        prohibitedItems
    ];

    // Build prompt
    let prompt = parts.filter(Boolean).join('. ').trim();
    
    // Add exclusions (for negative prompting)
    if (resolvedFocus.exclude.length > 0) {
        const exclusions = resolvedFocus.exclude
            .map(id => context.entities.find(e => e.id === id)?.name)
            .filter(Boolean)
            .join(', ');
        if (exclusions) {
            prompt += `. Do not include: ${exclusions}`;
        }
    }

    // Clean up any double periods or spacing issues
    return prompt.replace(/\.\s*\./g, '.').replace(/,\s*\./g, '.').trim();
}

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return hash;
}

export function generateConsistentSeed(shot: StructuredShot, shotIndex: number): number {
    const allEntities = [...shot.focus.emphasis, ...shot.focus.exclude].sort();
    const seedBase = `${shot.sceneId}_${allEntities.join(',')}`;
    return Math.abs(hashCode(seedBase) + shotIndex) % 2147483647 || 1;
}
