// src/dev/runtime/skillsProbe.ts — DEV console hook: window.__pantheonSkills

import { setEnergy } from '../../core/energy';
import { state } from '../../core/state/gameState';
import { modifiers } from '../../skills/modifiers';
import type { SkillRuntime } from '../../skills/skillRuntime';
import { installDevHook } from './devHook';

export interface SkillsProbeSources {
  getYaw: () => number;
}

/**
 * Install `window.__pantheonSkills`: look at the tree, take and give back nodes, give sparks, set the
 * energy and read the live modifiers. Returns a disposer that removes the hook.
 */
export function initSkillsProbe(skills: SkillRuntime, src: SkillsProbeSources): () => void {
  const removeHook = installDevHook('__pantheonSkills', {
    yaw: () => src.getYaw(),
    state: () => skills.state(),
    modifiers: () => ({ ...modifiers }),
    energyCap: () => state.energyCap,
    energy: () => state.energy,
    setEnergy: (value: number) => setEnergy(value),
    unlock: (id: string) => skills.unlock(id),
    canUnlock: (id: string) => skills.canUnlock(id),
    respec: () => skills.respec(),
    grantSparks: (count: number) => skills.grantSparks(count),
    /** Open arch II now, as if the converted village had earned `faithEarned` faith. */
    openVillage: (faithEarned = 9999) => skills.syncVillage({ converted: true, faithEarned }),
  });
  return removeHook;
}
