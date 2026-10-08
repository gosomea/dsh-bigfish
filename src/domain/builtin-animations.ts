import type { ScenePack, Action } from '../contract/scenes.js';
import type { PetBundle, PetAnimation } from '../pet/contract.js';
import type { PetInput } from '../pet/director.js';
import { roleFor } from '../pet/director.js';
import { motionAllowed } from './motion-policy.js';

/** The old motions keep their original renderer; these descriptors only share its scheduling clock. */
export function extendBuiltinAnimations(pack: ScenePack, extra: PetBundle): PetBundle {
  const actions = [...new Map(pack.scenes.flatMap(s => s.actions).map(a => [a.motion, a])).values()];
  const base = extra.animations.find(a => a.id === extra.manifest.fallbacks.idle)!.frames[0]!;
  const legacy: PetAnimation[] = actions.map(action => {
    const states = [...new Set(pack.scenes.flatMap(scene => scene.actions).filter(a => a.motion === action.motion).flatMap(a => a.states))];
    const reaction = ['flinch', 'dodge'].includes(action.motion);
    const tags = reaction ? ['near-miss'] : [...new Set(states.map(roleFor))];
    if (states.includes('idle') && !['breathe', 'sleep'].includes(action.motion)) tags.push('greeting');
    if (action.motion === 'type') tags.push('writing');
    if (action.motion === 'read') tags.push('read', 'thinking');
    if (action.motion === 'repair') tags.push('command');
    if (action.motion === 'peek') tags.push('search');
    if (action.motion === 'shuffle') tags.push('parallel');
    if (action.motion === 'stamp') tags.push('export');
    const sign = action.motion === 'wait-sign' || action.motion.startsWith('sign-');
    return { id: 'classic:' + action.motion, label: action.motion, tags,
      intensity: ['breathe','type','confirm','celebrate','read'].includes(action.motion)?0:[0, 1, 2].find(level => motionAllowed(action.motion, level, false))!,
      family: sign ? 'sign' : 'classic', weight: action.weight, cooldownMs: action.cooldownMs,
      loop: action.animation?.loop !== false, speed: [1, 1],
      frames: [{ ...base, durationMs: action.animation
        ? 1000 * (action.animation.pingPong ? action.animation.frames.length * 2 - 2 : action.animation.frames.length) / action.animation.fps
        : action.durationMs, ...(sign ? { sign: { x: 0, y: 0, width: 1, height: 1, angle: 0 } } : {}) }],
    };
  });
  return { ...extra, animations: [...legacy, ...extra.animations.filter(a => Boolean(a.family))],
    manifest: { ...extra.manifest, fallbacks: {
      idle: 'classic:breathe', working: 'classic:type', attention: 'classic:confirm', success: 'classic:celebrate', error: 'classic:read',
    } },
  };
}

/** Retain the original state, pressure and fatigue constraints when old and new actions rotate together. */
export function builtinAnimationAllowed(pack: ScenePack, animation: PetAnimation, input: PetInput, fatigue: number): boolean {
  if (!animation.id.startsWith('classic:')) return true;
  const motion = animation.id.slice('classic:'.length);
  return pack.scenes.flatMap(s => s.actions).some((action: Action) =>
    action.motion === motion && action.states.includes(input.state) &&
    (input.reduced || input.richness === 0 ||
      input.pressure >= action.pressure[0] && input.pressure <= action.pressure[1] && fatigue >= action.fatigue[0] && fatigue <= action.fatigue[1]));
}
