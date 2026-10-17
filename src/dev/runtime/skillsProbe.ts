// src/dev/runtime/skillsProbe.ts — DEV console hook: window.__pantheonSkills

import type { AbilityDef } from '../../abilities/abilities';
import { createAbilityCaster } from '../../abilities/caster';
import { addEnergy, setEnergy } from '../../core/energy';
import { state } from '../../core/GameState';
import { modifiers } from '../../skills/modifiers';
import type { SkillRuntime } from '../../skills/skillRuntime';

/** A power that exists only here, to try the cast pipeline on the real energy before real ones exist. */
const PROBE_POWER: AbilityDef = {
  id: 'probe-power',
  name: 'Probe power',
  arch: 'void',
  cost: { energy: 10 },
  cooldownSec: 5,
  targeting: 'self',
};

/**
 * Install `window.__pantheonSkills`: look at the tree, take and give back nodes, give sparks, read the
 * live modifiers and try a throwaway power. Returns a disposer that removes the hook.
 */
export function initSkillsProbe(skills: SkillRuntime): () => void {
  const win = window as unknown as Record<string, unknown>;
  const caster = createAbilityCaster({
    defs: [PROBE_POWER],
    isGranted: () => true,
    energy: () => state.energy,
    spendEnergy: (amount) => addEnergy(-amount),
    perform: () => true,
  });
  win.__pantheonSkills = {
    state: () => skills.state(),
    modifiers: () => ({ ...modifiers }),
    energyCap: () => state.energyCap,
    energy: () => state.energy,
    setEnergy: (value: number) => setEnergy(value),
    unlock: (id: string) => skills.unlock(id),
    canUnlock: (id: string) => skills.canUnlock(id),
    respec: () => skills.respec(),
    grantSparks: (count: number) => skills.grantSparks(count),
    /** Cast the throwaway power (costs 10 energy, 5 s cooldown); `tick(seconds)` runs its cooldown. */
    castProbe: () => caster.cast(PROBE_POWER.id, { kind: 'self' }),
    probeStatus: () => caster.status(PROBE_POWER.id),
    tick: (seconds: number) => caster.update(seconds),
  };
  return () => {
    delete win.__pantheonSkills;
  };
}
