// src/ui/overview/overviewPowers.ts — casting the arch II powers from the village overview
//
// The overview's orb is the cursor. Choose a power on the bar (click it, or press its number) and it is armed:
// a hint says what to click, the next click on the village casts it at what is under the cursor (nothing is
// selected then), and Esc puts it away without leaving the overview. A power that cannot be cast says why in
// a toast and stays armed, so a click that missed can be tried again.
//
// The orb's hand sits first on the same bar as a tool (`OverviewTool`): armed, it takes the clicks to lift and
// to put down and stays armed for the next one; while it holds something it takes them whatever is armed.

import { abilityById } from '../../abilities/abilities';
import { type AbilityView, refusalText } from '../../abilities/abilityView';
import type { CursorAim } from '../../abilities/builderPowers';
import type { CastResult } from '../../abilities/caster';
import type { Overview } from '../../overview/overviewController';
import { createBuilderBar } from '../abilities';
import { getHudSlot, h, isModalPanelOpen, isPanelOpen, notify, registerHotkey } from '../kit';

/** A tool on the bar that is not a cast: it takes clicks until it is put away (the orb's hand). */
export interface OverviewTool {
  id: string;
  /** Its slot, or null while it is not on the bar. */
  view: () => AbilityView | null;
  /** The hint while it is armed or busy. */
  hint: () => string;
  /** It holds something and wants the clicks even when it is not armed. */
  busy: () => boolean;
  /** A click on the village (it shows its own toasts). */
  click: () => void;
  /** Esc: lets go of what it holds; false when there was nothing to let go. */
  escape: () => boolean;
  /** Every frame in the overview; `live` while it takes the clicks, false once the overview is left. */
  frame: (live: boolean) => void;
}

export interface OverviewPowersDeps {
  overview: Overview;
  /** The arch II powers the player has. */
  list: () => AbilityView[];
  cast: (id: string, aim: CursorAim) => CastResult;
  /** The orb's hand, shown first on the bar. */
  tool?: OverviewTool;
}

export interface OverviewPowers {
  /** The power armed now, or null. */
  armed: () => string | null;
  arm: (id: string | null) => void;
  dispose: () => void;
}

const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'] as const;

export function createOverviewPowers(deps: OverviewPowersDeps): OverviewPowers {
  const { overview, tool } = deps;
  let armed: string | null = null;

  const hint = h('p', { class: 'k-hint k-hint--accent' });
  hint.hidden = true;
  getHudSlot('hints').appendChild(hint);

  /** The tool takes the clicks: armed, or full while nothing else is armed. */
  const toolLive = () => !!tool && (armed === tool.id || (armed === null && tool.busy()));
  /** What the bar shows as armed. */
  const shownArmed = () => armed ?? (tool?.busy() ? tool.id : null);

  const showHint = () => {
    let text: string | null = null;
    if (overview.phase() === 'overview') {
      if (tool && toolLive()) text = tool.hint();
      else if (armed !== null) {
        text = `${abilityById(armed)?.armHint ?? 'Click to cast'} · Esc to put it away`;
      }
    }
    hint.hidden = text === null;
    if (text !== null && hint.textContent !== text) hint.textContent = text;
  };

  const arm = (id: string | null) => {
    armed = id;
    showHint();
  };

  const aim = (): CursorAim => {
    const ground = overview.hoverPoint();
    return { ground: ground ? { x: ground.x, z: ground.z } : null };
  };

  const choose = (id: string) => {
    if (overview.phase() !== 'overview') return;
    arm(armed === id ? null : id);
  };

  const bar = createBuilderBar({
    list: () => {
      const own = deps.list();
      const slot = tool?.view();
      return slot ? [slot, ...own] : own;
    },
    armed: shownArmed,
    onChoose: choose,
    visible: () => overview.phase() === 'overview',
  });

  // An armed power takes the click (a cast or a refusal) ahead of the info panel's selecting.
  const offClick = overview.onClick(
    () => {
      if (isModalPanelOpen()) return false;
      if (tool && toolLive()) {
        tool.click();
        return true;
      }
      if (armed === null) return false;
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

  // Esc puts back what the hand holds, then puts an armed power away, before it leaves the overview.
  const offEscape = overview.addEscapeGuard(() => {
    if (isPanelOpen()) return false;
    if (tool?.busy() && toolLive() && tool.escape()) {
      showHint();
      return true;
    }
    if (armed === null) return false;
    arm(null);
    return true;
  });

  const offKeys = SLOT_KEYS.map((code, index) =>
    registerHotkey(
      code,
      () => {
        // The info panel is not modal: the keys keep working beside it; any other panel takes them.
        if (isModalPanelOpen()) return;
        const slot = tool?.view();
        const views = slot ? [slot, ...deps.list()] : deps.list();
        const view = views[index];
        if (view) choose(view.id);
      },
      'Village power',
    ),
  );

  // Leaving the overview puts the power away (what the hand holds stays held).
  const leave = () => {
    if (overview.phase() === 'overview') return false;
    if (armed !== null) arm(null);
    tool?.frame(false);
    showHint();
    return true;
  };
  const offFrame = overview.onFrame(() => {
    if (leave()) return;
    tool?.frame(toolLive());
    showHint();
  });
  const timer = window.setInterval(leave, 250);

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
