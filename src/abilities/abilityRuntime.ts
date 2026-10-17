// src/abilities/abilityRuntime.ts — the cast pipeline wired to the running game
//
// Energy is spent through core/energy.ts, which never touches the latched cap reveal, so casting does
// not undo the sunrise. A power's effect lives with the system it changes and is hooked in with `onCast`.

import { bus } from '../core/EventBus';
import { addEnergy } from '../core/energy';
import { state } from '../core/GameState';
import type { SkillRuntime } from '../skills/skillRuntime';
import { ABILITIES, type AbilityDef, type AbilityTarget } from './abilities';
import { type AbilityCaster, createAbilityCaster } from './caster';

export interface AbilityRuntime extends AbilityCaster {
  defs: readonly AbilityDef[];
  /** Hooks in the effect of a power. Without one, the power cannot be cast. */
  onCast: (id: string, effect: (target: AbilityTarget) => boolean) => void;
}

export function initAbilities(skills: SkillRuntime): AbilityRuntime {
  const effects = new Map<string, (target: AbilityTarget) => boolean>();
  const caster = createAbilityCaster({
    defs: ABILITIES,
    isGranted: skills.isAbilityGranted,
    energy: () => state.energy,
    spendEnergy: (amount) => addEnergy(-amount),
    perform: (def, target) => effects.get(def.id)?.(target) ?? false,
  });
  return {
    defs: ABILITIES,
    status: caster.status,
    cast: (id, target) => {
      const result = caster.cast(id, target);
      if (result.ok) bus.emit('ability:cast', { id });
      return result;
    },
    update: caster.update,
    onCast: (id, effect) => {
      effects.set(id, effect);
    },
  };
}
