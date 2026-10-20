// src/skills/skillRuntime.ts — the skill tree in the running game
//
// Holds the player's `SkillsState`, applies what the ranks taken add up to (the shared `modifiers`
// record and the energy cap), opens the tree at the energy cap, and says so on the event bus. The rules
// are in skillTree.ts; this file is only the wiring.

import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { setEnergy } from '../core/energy';
import { state } from '../core/state/gameState';
import { setModifiers } from './modifiers';
import {
  canUnlock,
  grantedAbilities,
  grantSparks,
  modifiersOf,
  newSkillsState,
  openTree,
  respec,
  type SkillsState,
  syncVillageTree,
  type UnlockCheck,
  unlock,
} from './skillTree';

export interface SkillRuntime {
  /** A copy of the current state. */
  state: () => SkillsState;
  canUnlock: (id: string) => UnlockCheck;
  unlock: (id: string) => UnlockCheck;
  respec: () => void;
  grantSparks: (count: number) => void;
  /** Opens arch II and gives its sparks as the village earns faith (call now and then; cheap). */
  syncVillage: (village: { converted: boolean; faithEarned: number }) => void;
  /** Whether the tree has been opened (no copy of the state). */
  isOpen: () => boolean;
  /** Whether arch II, The Village, has opened. */
  isVillageOpen: () => boolean;
  isAbilityGranted: (id: string) => boolean;
  dispose: () => void;
}

export function initSkills(initial?: SkillsState): SkillRuntime {
  let current: SkillsState = initial
    ? { ...initial, ranks: { ...initial.ranks } }
    : newSkillsState();

  /** Ids of the abilities the ranks grant; kept here so asking costs no allocation. */
  let granted = new Set<string>();

  /** Push the ranks' effects into the game: the modifier record and the energy cap. */
  const apply = () => {
    granted = new Set(grantedAbilities(current));
    const next = modifiersOf(current);
    setModifiers(next);
    const cap = PHASE0.ENERGY_CAP + next.energyCapAdd;
    if (state.energyCap !== cap) {
      state.energyCap = cap;
      // Clamps the energy to the new cap and lets the HUD and the story thresholds follow.
      setEnergy(state.energy);
    }
  };

  const changed = () => {
    apply();
    bus.emit('skills:changed', { sparks: current.sparks });
  };

  const onMemory = (payload: { id: number }) => {
    if (payload.id !== PHASE0.AETHON_MEMORY_ID || current.opened) return;
    current = openTree(current);
    changed();
    bus.emit('skills:opened', { sparks: current.sparks });
  };
  bus.on('memory:trigger', onMemory);

  apply();

  return {
    state: () => ({ ...current, ranks: { ...current.ranks } }),
    canUnlock: (id) => canUnlock(current, id),
    unlock: (id) => {
      const result = unlock(current, id);
      if (!result.ok) return result;
      current = result.state;
      changed();
      return { ok: true };
    },
    respec: () => {
      current = respec(current);
      changed();
    },
    grantSparks: (count) => {
      const next = grantSparks(current, count);
      if (next === current) return;
      current = next;
      changed();
    },
    syncVillage: (village) => {
      const next = syncVillageTree(current, village);
      if (next === current) return;
      const opening = !current.villageOpened && next.villageOpened;
      current = next;
      changed();
      if (opening) bus.emit('skills:villageOpened', { sparks: current.sparks });
    },
    isOpen: () => current.opened,
    isVillageOpen: () => current.villageOpened,
    isAbilityGranted: (id) => granted.has(id),
    dispose: () => {
      bus.off('memory:trigger', onMemory);
    },
  };
}
