// src/ui/abilities/abilityBar.ts — the ability bar: one slot per power the player has, with its cooldown
//
// Hidden while the player has no power. A slot shows the name, what it costs and a ring that empties
// as the cooldown runs; a power that cannot be cast is dimmed and says why in a word. The bar reads a
// small `AbilitySource`, so the same code serves the real powers and a test power.

import type { AbilityView } from '../../abilities/abilityView';
import { createContextualHud, getLayer, h, icon } from '../kit';

export interface AbilitySource {
  /** The powers the player has, in a stable order. */
  list: () => AbilityView[];
}

const REFRESH_MS = 100;

export function createAbilityBar(source: AbilitySource): { dispose: () => void } {
  const bar = h('div', { class: 'ab-bar', attrs: { role: 'group', 'aria-label': 'Powers' } });
  getLayer('hud').appendChild(bar);
  const hud = createContextualHud(bar, { base: 'hidden' });
  const slots = new Map<string, { el: HTMLElement; ring: HTMLElement; note: HTMLElement }>();

  const render = () => {
    const views = source.list();
    hud.setBase(views.length > 0 ? 'persistent' : 'hidden');
    for (const [id, slot] of slots) {
      if (!views.some((v) => v.id === id)) {
        slot.el.remove();
        slots.delete(id);
      }
    }
    for (const v of views) {
      let slot = slots.get(v.id);
      if (!slot) {
        const ring = h('span', { class: 'ab-slot__ring' });
        const note = h('span', { class: 'ab-slot__note' });
        const el = h(
          'div',
          { class: 'ab-slot', attrs: { 'data-ability': v.id } },
          ring,
          h('span', { class: 'ab-slot__icon' }, icon('energy', { size: '1.2em' })),
          h('span', { class: 'ab-slot__name', text: v.name }),
          h('span', { class: 'ab-slot__cost', text: v.cost }),
          note,
        );
        bar.appendChild(el);
        slot = { el, ring, note };
        slots.set(v.id, slot);
      }
      slot.el.dataset.ready = String(v.ready);
      slot.el.dataset.active = String(v.active);
      slot.ring.style.setProperty('--ab-cooldown', String(v.cooldownFraction));
      // A running channel says so in a word; otherwise the wait left, or why it cannot be cast.
      slot.note.textContent = v.active
        ? v.note
        : v.cooldownLeft > 0
          ? `${Math.ceil(v.cooldownLeft)} s`
          : v.ready
            ? ''
            : v.note;
    }
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
