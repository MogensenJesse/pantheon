// src/abilities/abilityRuntime.ts — the cast pipeline wired to the running game
//
// Energy is spent through core/energy.ts, which never touches the latched cap reveal, so casting does
// not undo the sunrise. What a power does lives with the system it changes (abilities/powers.ts) and is
// hooked in with `setPerformer`.

import { bus } from '../core/EventBus';
import { energyMeter } from '../core/energy';
import type { SkillRuntime } from '../skills/skillRuntime';
import { ABILITIES, type AbilityDef, type AbilityTarget, abilityById } from './abilities';
import { type AbilityCaster, createAbilityCaster } from './caster';

export interface AbilityRuntime extends AbilityCaster {
  defs: readonly AbilityDef[];
  /** The player has the power (a node took it, or it comes with the tree). */
  isGranted: (id: string) => boolean;
  /** Hooks in what powers do: true when the effect happened. Without one, no power can be cast. */
  setPerformer: (perform: (def: AbilityDef, target: AbilityTarget) => boolean) => void;
  /** Where faith for the arch II powers comes from (the village's); without it they cannot be cast. */
  setFaith: (faith: { amount: () => number; spend: (amount: number) => void }) => void;
}

export function initAbilities(
  skills: SkillRuntime,
  /** Cooldowns saved with the game. */
  savedCooldowns: readonly [string, number][] = [],
): AbilityRuntime {
  let performer: ((def: AbilityDef, target: AbilityTarget) => boolean) | null = null;
  let faithSource: { amount: () => number; spend: (amount: number) => void } | null = null;
  // Murmur is there from the moment the tree opens; the other powers come from nodes.
  const isGranted = (id: string) => {
    const def = abilityById(id);
    return (
      skills.isAbilityGranted(id) ||
      (skills.isOpen() && def?.grantedAtOpen === true) ||
      (skills.isVillageOpen() && def?.grantedWithVillage === true)
    );
  };
  const caster = createAbilityCaster({
    defs: ABILITIES,
    isGranted,
    energy: energyMeter.amount,
    spendEnergy: energyMeter.spend,
    faith: {
      amount: () => faithSource?.amount() ?? 0,
      spend: (amount) => faithSource?.spend(amount),
    },
    perform: (def, target) => performer?.(def, target) ?? false,
  });
  caster.restore(savedCooldowns);
  return {
    defs: ABILITIES,
    isGranted,
    status: caster.status,
    cast: (id, target) => {
      const result = caster.cast(id, target);
      if (result.ok) bus.emit('ability:cast', { id });
      return result;
    },
    update: caster.update,
    cooldowns: caster.cooldowns,
    restore: caster.restore,
    setPerformer: (perform) => {
      performer = perform;
    },
    setFaith: (source) => {
      faithSource = source;
    },
  };
}
