// src/ui/abilities/builderBar.ts — the bar of arch II powers in the village overview
//
// The same slots as the roam ability bar (name, cost, a ring that empties as the cooldown runs), but here a
// slot is a button: click it, or press its number, and the power is armed. The overview takes it from there.

import type { AbilityView } from '../../abilities/abilityView';
import { createSlotBar } from './slotBar';

export interface BuilderBarDeps {
  /** The powers the player has, in a stable order. */
  list: () => AbilityView[];
  /** The power armed now, or null. */
  armed: () => string | null;
  /** A slot was chosen. */
  onChoose: (id: string) => void;
  /** Whether the bar shows at all (the overview is up). */
  visible: () => boolean;
}

export function createBuilderBar(deps: BuilderBarDeps): { dispose: () => void } {
  return createSlotBar({
    className: 'ab-bar--overview',
    label: 'Village powers',
    list: () => (deps.visible() ? deps.list() : []),
    onChoose: deps.onChoose,
    nameOf: (v, index) => `${index + 1} · ${v.name}`,
    mark: (slot, v) => {
      slot.dataset.armed = String(deps.armed() === v.id);
    },
    noteOf: (v) => (v.cooldownLeft > 0 ? `${Math.ceil(v.cooldownLeft)} s` : v.ready ? '' : v.note),
  });
}
