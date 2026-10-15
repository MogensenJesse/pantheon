// src/ui/kit/visibility.ts — the four visibility states of a HUD element
//
//   hidden      not shown (the default while roaming)
//   peek        shown briefly after something relevant happened, then back to the base state
//   persistent  shown for as long as it matters
//   expanded    persistent with the full detail
//
// Fades come from tokens: quick in (150 ms), slow out (500 ms). The element only needs the class k-vis;
// this sets k-vis--<state> and data-hud, and hides it from screen readers while it is hidden.

export type HudState = 'hidden' | 'peek' | 'persistent' | 'expanded';
export type HudBaseState = Exclude<HudState, 'peek'>;

export interface ContextualHud {
  readonly element: HTMLElement;
  state: () => HudState;
  /** What the element returns to after a peek. */
  setBase: (state: HudBaseState) => void;
  /** Show for `holdMs` (default 2 s), then go back to the base state. Ignored when already persistent. */
  peek: (holdMs?: number) => void;
  dispose: () => void;
}

export interface ContextualHudOptions {
  base?: HudBaseState;
  holdMs?: number;
}

const STATES: readonly HudState[] = ['hidden', 'peek', 'persistent', 'expanded'];

export function createContextualHud(
  element: HTMLElement,
  options: ContextualHudOptions = {},
): ContextualHud {
  const holdMs = options.holdMs ?? 2000;
  let base: HudBaseState = options.base ?? 'hidden';
  let current: HudState = base;
  let timer: number | undefined;

  element.classList.add('k-vis');
  const apply = (state: HudState) => {
    current = state;
    for (const s of STATES) element.classList.toggle(`k-vis--${s}`, s === state);
    element.dataset.hud = state;
    if (state === 'hidden') element.setAttribute('aria-hidden', 'true');
    else element.removeAttribute('aria-hidden');
  };
  apply(base);

  return {
    element,
    state: () => current,
    setBase: (state) => {
      base = state;
      if (timer === undefined) apply(base);
    },
    peek: (ms = holdMs) => {
      if (base !== 'hidden') return;
      apply('peek');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        apply(base);
      }, ms);
    },
    dispose: () => {
      window.clearTimeout(timer);
      timer = undefined;
      element.classList.remove('k-vis', ...STATES.map((s) => `k-vis--${s}`));
      delete element.dataset.hud;
      element.removeAttribute('aria-hidden');
    },
  };
}
