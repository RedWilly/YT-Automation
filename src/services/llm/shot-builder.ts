import type { StoryContext, Scene, StructuredShot, Composition } from '../../types/llm.ts';
import type { ResolvedStyle } from '../../styles/types.ts';

export type { StructuredShot } from '../../types/llm.ts';

const COMPOSITION_PREFIXES: Record<Composition, string> = {
    'extreme-wide': 'Extreme wide establishing shot:',
    'wide': 'Wide shot:',
    'medium': 'Medium shot:',
    'close-up': 'Close-up:',
    'extreme-close-up': 'Extreme close-up:'
};

function getCompositionPrefix(composition: StructuredShot['composition']): string {
    return composition ? COMPOSITION_PREFIXES[composition] || '' : '';
}

function buildEntityDescription(
    entityId: string, 
    context: StoryContext, 
    detail: 'visual-only' | 'brief-visual'
): string {
    const entity = context.entities.find(e => e.id === entityId);
    if (!entity) return '';

    // Get group visual anchor if entity belongs to a group
    const groupAnchor = entity.groupId 
        ? context.groups?.find(g => g.id === entity.groupId)?.visualAnchor 
        : null;

    // 'visual-only': Group appearance + entity visual anchor for primary subjects
    // e.g., "grey Wehrmacht uniforms, steel helmets, scarred face"
    if (detail === 'visual-only') {
        if (groupAnchor && entity.visualAnchor) {
            return `${groupAnchor}, ${entity.visualAnchor}`;
        }
        return groupAnchor || entity.visualAnchor;
    }
    
    // 'brief-visual': Name + (group + visual anchor) in brackets for secondary elements
    // e.g., "Soldier Klaus (grey Wehrmacht uniforms, steel helmets, scarred face)"
    if (detail === 'brief-visual') {
        const visualParts = [groupAnchor, entity.visualAnchor].filter(Boolean).join(', ');
        return visualParts 
            ? `${entity.name} (${visualParts})` 
            : entity.name;
    }

    return '';

    // UNUSED DETAIL LEVELS (commented out for reference):
    // 
    // 'brief': Just the entity name - not useful for image generation
    // since the generator doesn't know who "Captain Miller" is
    // if (detail === 'brief') return entity.name;
    //
    // 'full': Group anchor + visual anchor + unique traits
    // Too verbose for prompts, creates token bloat
    // const parts: string[] = [];
    // if (entity.groupId) {
    //     const group = context.groups?.find(g => g.id === entity.groupId);
    //     if (group?.visualAnchor) parts.push(group.visualAnchor);
    // }
    // if (entity.visualAnchor && !parts.includes(entity.visualAnchor)) {
    //     parts.push(entity.visualAnchor);
    // }
    // if (entity.uniqueTraits) parts.push(entity.uniqueTraits);
    // return parts.filter(Boolean).join(', ');
}

function buildSettingDescription(scene: Scene | undefined, context: StoryContext): string {
    if (!scene) return '';
    
    const setting = context.entities.find(e => 
        e.type === 'location' && 
        (e.id === scene.id || scene.primaryEntities?.includes(e.id))
    );
    
    return setting?.visualAnchor || scene.setting || context.primarySetting;
}

function buildAtmosphere(scene: Scene | undefined, context: StoryContext): string {
    const mood = scene?.mood || context.tone;
    const lightingCue = scene?.lightingCue;
    
    if (lightingCue) return lightingCue;
    if (mood) return mood;
    return '';
}

export function buildImagePrompt(
    shot: StructuredShot, 
    context: StoryContext, 
    _style: ResolvedStyle
): string {
    const scene = context.scenes.find(s => s.id === shot.sceneId);
    const compositionPrefix = getCompositionPrefix(shot.composition);

    // Build the core action description with primary subjects
    const primarySubjects = shot.focus.primary
        .map(id => {
            const entity = context.entities.find(e => e.id === id);
            // For locations, use in setting instead of as subject
            if (entity?.type === 'location') return null;
            return buildEntityDescription(id, context, 'visual-only');
        })
        .filter(Boolean);

    // Start with action (most important)
    const actionPhrase = shot.action;
    
    // Build subject-action combo
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
    
    // Add primary location
    const primaryLocation = shot.focus.primary.find(id => {
        const entity = context.entities.find(e => e.id === id);
        return entity?.type === 'location';
    });
    
    if (primaryLocation) {
        const locDesc = buildEntityDescription(primaryLocation, context, 'visual-only');
        if (locDesc) settingParts.push(locDesc);
    } else {
        const settingDesc = buildSettingDescription(scene, context);
        if (settingDesc) settingParts.push(settingDesc);
    }

    // Add secondary elements as background/context
    const secondaryElements = shot.focus.secondary
        .map(id => buildEntityDescription(id, context, 'brief-visual'))
        .filter(Boolean);
    
    if (secondaryElements.length > 0) {
        settingParts.push(`${secondaryElements.join(' and ')} visible in background`);
    }

    // Build atmosphere/lighting
    const atmosphere = buildAtmosphere(scene, context);
    
    // Assemble in natural reading order
    const parts = [
        compositionPrefix,
        coreDescription,
        settingParts.length > 0 ? settingParts.join('. ') : null,
        atmosphere || null,
        shot.framingNote || null,
        context.era || null
    ];

    // Add exclusions if needed
    let prompt = parts.filter(Boolean).join('. ').trim();
    
    if (shot.focus.exclude.length > 0) {
        const exclusions = shot.focus.exclude
            .map(id => context.entities.find(e => e.id === id)?.name)
            .filter(Boolean)
            .join(', ');
        prompt += `. Do not include: ${exclusions}`;
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
    const allEntities = [...shot.focus.primary, ...shot.focus.secondary].sort();
    const seedBase = `${shot.sceneId}_${allEntities.join(',')}`;
    return Math.abs(hashCode(seedBase) + shotIndex) % 2147483647 || 1;
}
