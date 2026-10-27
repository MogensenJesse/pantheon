// src/ui/overview/powerBar.ts — the bar of powers in the village overview: the orb's hand first, then the weather powers
//
// A row of slots (name, cost, a ring that empties as the cooldown runs); a slot is a button: click it, or press
// its number, and the power is armed. `overviewPowers.ts` takes it from there.

import type { AbilityView } from '../../abilities/abilityView';
import { createContextualHud, getLayer, h, icon } from '../kit';
import './powerBar.css';

export interface PowerBarDeps {
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

interface Slot {
  el: HTMLElement;
  ring: HTMLElement;
  note: HTMLElement;
}

export function createPowerBar(deps: PowerBarDeps): { dispose: () => void } {
  const bar = h('div', {
    class: 'ov-powers',
    attrs: { role: 'group', 'aria-label': 'Village powers' },
  });
  getLayer('hud').appendChild(bar);
  const hud = createContextualHud(bar, { base: 'hidden' });
  const slots = new Map<string, Slot>();

  const addSlot = (v: AbilityView, index: number): Slot => {
    const ring = h('span', { class: 'ov-power__ring' });
    const note = h('span', { class: 'ov-power__note' });
    const el = h(
      'button',
      {
        class: 'ov-power',
        attrs: { type: 'button', 'data-power': v.id },
        on: { click: () => deps.onChoose(v.id) },
      },
      ring,
      h('span', { class: 'ov-power__icon' }, icon(v.costIcon, { size: '1.2em' })),
      h('span', { class: 'ov-power__name', text: `${index + 1} · ${v.name}` }),
      h('span', { class: 'ov-power__cost', text: v.cost }),
      note,
    );
    bar.appendChild(el);
    return { el, ring, note };
  };

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
        slot = addSlot(v, index);
        slots.set(v.id, slot);
      }
      const armed = deps.armed() === v.id;
      slot.el.dataset.ready = String(v.ready);
      slot.el.dataset.armed = String(armed);
      slot.el.setAttribute('aria-pressed', String(armed));
      slot.ring.style.setProperty('--ov-cooldown', String(v.cooldownFraction));
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
