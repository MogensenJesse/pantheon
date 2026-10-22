// src/ui/overview/overviewPowers.ts — casting the arch II powers from the village overview
//
// The overview's orb is the cursor. Choose a power on the bar (click it, or press 1 to 5) and it is armed:
// a hint says what to click, the next click on the village casts it at what is under the cursor (nothing is
// selected then), and Esc puts it away without leaving the overview. A power that cannot be cast says why in
// a toast and stays armed, so a click that missed can be tried again.

import { abilityById } from '../../abilities/abilities';
import { type AbilityView, refusalText } from '../../abilities/abilityView';
import type { CursorAim } from '../../abilities/builderPowers';
import type { CastResult } from '../../abilities/caster';
import type { Overview } from '../../overview/overviewController';
import type { Selection } from '../../overview/overviewPick';
import { createBuilderBar } from '../abilities/builderBar';
import { getHudSlot, h, isModalPanelOpen, isPanelOpen, notify, registerHotkey } from '../kit';

export interface OverviewPowersDeps {
  overview: Overview;
  /** The arch II powers the player has. */
  list: () => AbilityView[];
  cast: (id: string, aim: CursorAim) => CastResult;
  /** What is under the mouse (the overview's own pick). */
  pick: () => Selection | null;
}

export interface OverviewPowers {
  /** The power armed now, or null. */
  armed: () => string | null;
  arm: (id: string | null) => void;
  dispose: () => void;
}

const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] as const;

export function createOverviewPowers(deps: OverviewPowersDeps): OverviewPowers {
  const { overview } = deps;
  let armed: string | null = null;

  const hint = h('p', { class: 'k-hint k-hint--accent' });
  hint.hidden = true;
  getHudSlot('hints').appendChild(hint);

  const arm = (id: string | null) => {
    armed = id;
    hint.hidden = id === null;
    if (id !== null) {
      hint.textContent = `${abilityById(id)?.armHint ?? 'Click to cast'} · Esc to put it away`;
    }
  };

  const aim = (): CursorAim => {
    const ground = overview.hoverPoint();
    return {
      pick: deps.pick(),
      ground: ground ? { x: ground.x, z: ground.z } : null,
    };
  };

  const choose = (id: string) => {
    if (overview.phase() !== 'overview') return;
    arm(armed === id ? null : id);
  };

  const bar = createBuilderBar({
    list: deps.list,
    armed: () => armed,
    onChoose: choose,
    visible: () => overview.phase() === 'overview',
  });

  // An armed power takes the click (a cast or a refusal) ahead of the info panel's selecting.
  const offClick = overview.onClick(
    () => {
      if (armed === null || isModalPanelOpen()) return false;
      const result = deps.cast(armed, aim());
      if (result.ok) {
        arm(null);
      } else {
        notify({ text: refusalText(result.reason), kind: 'warning', key: 'builder-refusal' });
      }
      return true;
    },
    { first: true },
  );

  // Esc puts an armed power away before it leaves the overview.
  const offEscape = overview.addEscapeGuard(() => {
    if (armed === null || isPanelOpen()) return false;
    arm(null);
    return true;
  });

  const offKeys = SLOT_KEYS.map((code, index) =>
    registerHotkey(
      code,
      () => {
        // The info panel is not modal: the keys keep working beside it; any other panel takes them.
        if (isModalPanelOpen()) return;
        const view = deps.list()[index];
        if (view) choose(view.id);
      },
      'Village power',
    ),
  );

  // Leaving the overview puts the power away.
  const offFrame = overview.onFrame(() => {
    if (armed !== null && overview.phase() !== 'overview') arm(null);
  });
  const timer = window.setInterval(() => {
    if (armed !== null && overview.phase() !== 'overview') arm(null);
  }, 250);

  return {
    armed: () => armed,
    arm,
    dispose: () => {
      window.clearInterval(timer);
      offClick();
      offFrame();
      for (const off of offKeys) off();
      offEscape();
      bar.dispose();
      hint.remove();
    },
  };
}
