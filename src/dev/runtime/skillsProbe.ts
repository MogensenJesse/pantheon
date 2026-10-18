// src/dev/runtime/skillsProbe.ts — DEV console hook: window.__pantheonSkills

import { setEnergy } from '../../core/energy';
import { state } from '../../core/state/gameState';
import { modifiers } from '../../skills/modifiers';
import type { SkillRuntime } from '../../skills/skillRuntime';

export interface SkillsProbeSources {
  getYaw: () => number;
  /** Whether the radial cast menu is open. */
  radialOpen: () => boolean;
}

/**
 * Install `window.__pantheonSkills`: look at the tree, take and give back nodes, give sparks, set the
 * energy and read the live modifiers. Returns a disposer that removes the hook.
 */
export function initSkillsProbe(skills: SkillRuntime, src: SkillsProbeSources): () => void {
  const win = window as unknown as Record<string, unknown>;
  win.__pantheonSkills = {
    radialOpen: () => src.radialOpen(),
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
  };
  return () => {
    delete win.__pantheonSkills;
  };
}
