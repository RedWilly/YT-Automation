import type { StoryContext, Scene, StructuredShot, Composition } from '../../types/llm.ts';
import type { ResolvedStyle } from '../../styles/types.ts';

export type { StructuredShot } from '../../types/llm.ts';

const COMPOSITION_PREFIXES: Record<Composition, string> = {
    'extreme-wide': 'Extreme wide establishing shot,',
    'wide': 'Wide shot,',
    'medium': 'Medium shot,',
    'close-up': 'Close-up,',
    'extreme-close-up': 'Extreme close-up,',
    'two-shot': 'Two-shot,',
};

function getCompositionPrefix(composition: StructuredShot['composition']): string {
    return composition ? COMPOSITION_PREFIXES[composition] || '' : '';
}

function buildEntityDescription(entityId: string, context: StoryContext, detail: 'full' | 'brief'): string {
    const entity = context.entities.find(e => e.id === entityId);
    if (!entity) return '';

    if (detail === 'brief') return entity.name;

    if (entity.groupId) {
        const group = context.groups?.find(g => g.id === entity.groupId);
        if (group) {
            return [group.visualAnchor, entity.uniqueTraits || '', entity.visualAnchor]
                .filter(Boolean)
                .join(', ');
        }
    }

    return entity.visualAnchor;
}

function buildSceneBackdrop(scene: Scene | undefined, context: StoryContext): string {
    if (!scene) {
        return [context.primarySetting, context.tone, context.era].filter(Boolean).join(', ');
    }
    return [scene.setting, scene.mood, context.era].filter(Boolean).join(', ');
}

export function buildImagePrompt(shot: StructuredShot, context: StoryContext, _style: ResolvedStyle): string {
    const scene = context.scenes.find(s => s.id === shot.sceneId);
    const compositionPrefix = getCompositionPrefix(shot.composition);

    const primaryDescriptions = shot.focus.primary
        .map(id => buildEntityDescription(id, context, 'full'))
        .filter(Boolean);

    const secondaryDescriptions = shot.focus.secondary
        .map(id => buildEntityDescription(id, context, 'brief'))
        .filter(Boolean);

    const parts = [
        compositionPrefix,
        primaryDescriptions.join(', '),
        shot.action,
        buildSceneBackdrop(scene, context),
    ];

    if (secondaryDescriptions.length > 0) {
        parts.push(`with ${secondaryDescriptions.join(' and ')} in background`);
    }

    if (shot.framingNote) {
        parts.push(shot.framingNote);
    }

    return parts.filter(Boolean).join(', ').trim();
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
