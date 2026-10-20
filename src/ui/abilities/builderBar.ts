// src/ui/abilities/builderBar.ts — the bar of arch II powers in the village overview
//
// The same slots as the roam ability bar (name, cost, a ring that empties as the cooldown runs), but here a
// slot is a button: click it, or press its number, and the power is armed. The overview takes it from there.

import type { AbilityView } from '../../abilities/abilityView';
import { createContextualHud, getLayer, h, icon } from '../kit';

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

const REFRESH_MS = 100;

export function createBuilderBar(deps: BuilderBarDeps): {
  dispose: () => void;
} {
  const bar = h('div', {
    class: 'ab-bar ab-bar--overview',
    attrs: { role: 'group', 'aria-label': 'Village powers' },
  });
  getLayer('hud').appendChild(bar);
  const hud = createContextualHud(bar, { base: 'hidden' });
  const slots = new Map<string, { el: HTMLButtonElement; ring: HTMLElement; note: HTMLElement }>();

  const render = () => {
    const views = deps.visible() ? deps.list() : [];
    hud.setBase(views.length > 0 ? 'persistent' : 'hidden');
    for (const [id, slot] of slots) {
      if (!views.some((v) => v.id === id)) {
        slot.el.remove();
        slots.delete(id);
      }
    }
    views.forEach((v, index) => {
      let slot = slots.get(v.id);
      if (!slot) {
        const ring = h('span', { class: 'ab-slot__ring' });
        const note = h('span', { class: 'ab-slot__note' });
        const el = h(
          'button',
          {
            class: 'ab-slot ab-slot--button',
            attrs: { type: 'button', 'data-ability': v.id },
            on: { click: () => deps.onChoose(v.id) },
          },
          ring,
          h('span', { class: 'ab-slot__icon' }, icon(v.costIcon, { size: '1.2em' })),
          h('span', { class: 'ab-slot__name', text: `${index + 1} · ${v.name}` }),
          h('span', { class: 'ab-slot__cost', text: v.cost }),
          note,
        );
        bar.appendChild(el);
        slot = { el: el as HTMLButtonElement, ring, note };
        slots.set(v.id, slot);
      }
      slot.el.dataset.ready = String(v.ready);
      slot.el.dataset.armed = String(deps.armed() === v.id);
      slot.ring.style.setProperty('--ab-cooldown', String(v.cooldownFraction));
      slot.note.textContent =
        v.cooldownLeft > 0 ? `${Math.ceil(v.cooldownLeft)} s` : v.ready ? '' : v.note;
    });
  };

  const timer = window.setInterval(render, REFRESH_MS);
  render();
  return {
    dispose: () => {
      window.clearInterval(timer);
      hud.dispose();
      bar.remove();
    },
  };
}
