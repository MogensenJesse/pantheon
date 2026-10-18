// src/abilities/abilityRuntime.ts — the cast pipeline wired to the running game
//
// Energy is spent through core/energy.ts, which never touches the latched cap reveal, so casting does
// not undo the sunrise. What a power does lives with the system it changes (abilities/powers.ts) and is
// hooked in with `setPerformer`.

import { bus } from '../core/EventBus';
import { energyMeter } from '../core/energy';
import type { SkillRuntime } from '../skills/skillRuntime';
import { ABILITIES, type AbilityDef, type AbilityTarget } from './abilities';
import { type AbilityCaster, createAbilityCaster } from './caster';

export interface AbilityRuntime extends AbilityCaster {
  defs: readonly AbilityDef[];
  /** The player has the power (a node took it, or it comes with the tree). */
  isGranted: (id: string) => boolean;
  /** Hooks in what powers do: true when the effect happened. Without one, no power can be cast. */
  setPerformer: (perform: (def: AbilityDef, target: AbilityTarget) => boolean) => void;
}

export function initAbilities(skills: SkillRuntime): AbilityRuntime {
  let performer: ((def: AbilityDef, target: AbilityTarget) => boolean) | null = null;
  // Murmur is there from the moment the tree opens; the other powers come from nodes.
  const isGranted = (id: string) =>
    skills.isAbilityGranted(id) ||
    (skills.isOpen() && ABILITIES.find((d) => d.id === id)?.grantedAtOpen === true);
  const caster = createAbilityCaster({
    defs: ABILITIES,
    isGranted,
    energy: energyMeter.amount,
    spendEnergy: energyMeter.spend,
    perform: (def, target) => performer?.(def, target) ?? false,
  });
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
    setPerformer: (perform) => {
      performer = perform;
    },
  };
}
