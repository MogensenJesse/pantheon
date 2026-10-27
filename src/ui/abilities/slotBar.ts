// src/ui/abilities/slotBar.ts — a row of power slots: name, cost, and a ring that empties as the cooldown runs
//
// The overview's village-power bar is built on it; a slot can be a button, say what it likes in its name and set
// the data attributes that mark its state.

import type { AbilityView } from '../../abilities/abilityView';
import { createContextualHud, getLayer, h, icon } from '../kit';

export interface SlotBarOptions {
  /** Extra class on the bar (`ab-bar` is always there). */
  className?: string;
  label: string;
  /** The powers to show now, in a stable order; none hides the bar. */
  list: () => AbilityView[];
  /** Makes each slot a button that calls this when chosen. */
  onChoose?: (id: string) => void;
  /** The name written in a slot (default: the power's name). */
  nameOf?: (view: AbilityView, index: number) => string;
  /** The word in a slot's corner: the wait left, or why the power is not ready. */
  noteOf: (view: AbilityView) => string;
  /** Sets the data attributes that style a slot's state. */
  mark: (slot: HTMLElement, view: AbilityView) => void;
}

const REFRESH_MS = 100;

export function createSlotBar(options: SlotBarOptions): { dispose: () => void } {
  const bar = h('div', {
    class: options.className ? `ab-bar ${options.className}` : 'ab-bar',
    attrs: { role: 'group', 'aria-label': options.label },
  });
  getLayer('hud').appendChild(bar);
  const hud = createContextualHud(bar, { base: 'hidden' });
  const slots = new Map<string, { el: HTMLElement; ring: HTMLElement; note: HTMLElement }>();

  const render = () => {
    const views = options.list();
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
        const children = [
          ring,
          h('span', { class: 'ab-slot__icon' }, icon(v.costIcon, { size: '1.2em' })),
          h('span', {
            class: 'ab-slot__name',
            text: options.nameOf ? options.nameOf(v, index) : v.name,
          }),
          h('span', { class: 'ab-slot__cost', text: v.cost }),
          note,
        ];
        const choose = options.onChoose;
        const el = choose
          ? h(
              'button',
              {
                class: 'ab-slot ab-slot--button',
                attrs: { type: 'button', 'data-ability': v.id },
                on: { click: () => choose(v.id) },
              },
              ...children,
            )
          : h('div', { class: 'ab-slot', attrs: { 'data-ability': v.id } }, ...children);
        bar.appendChild(el);
        slot = { el, ring, note };
        slots.set(v.id, slot);
      }
      slot.el.dataset.ready = String(v.ready);
      options.mark(slot.el, v);
      slot.ring.style.setProperty('--ab-cooldown', String(v.cooldownFraction));
      slot.note.textContent = options.noteOf(v);
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
