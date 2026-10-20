// src/ui/abilities/abilityBar.ts — the ability bar: one slot per power the player has, with its cooldown
//
// Hidden while the player has no power. A slot shows the name, what it costs and a ring that empties
// as the cooldown runs; a power that cannot be cast is dimmed and says why in a word. The bar reads a
// small `AbilitySource`, so the same code serves the real powers and a test power.

import type { AbilityView } from '../../abilities/abilityView';
import { createSlotBar } from './slotBar';

export interface AbilitySource {
  /** The powers the player has, in a stable order. */
  list: () => AbilityView[];
}

export function createAbilityBar(source: AbilitySource): { dispose: () => void } {
  return createSlotBar({
    label: 'Powers',
    list: source.list,
    mark: (slot, v) => {
      slot.dataset.active = String(v.active);
    },
    // A running channel says so in a word; otherwise the wait left, or why it cannot be cast.
    noteOf: (v) =>
      v.active
        ? v.note
        : v.cooldownLeft > 0
          ? `${Math.ceil(v.cooldownLeft)} s`
          : v.ready
            ? ''
            : v.note,
  });
}
