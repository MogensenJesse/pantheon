// src/rendering/postfx/effectGraphBypass.ts — disconnect zero-weight god rays / bloom from the post graph
/**
 * When a mix weight is ~0, the upstream BloomNode / GodraysNode passes still run if they
 * stay referenced in the composite Fn. This gate rebuilds the composite without those
 * references after a short hold, and reconnects immediately when weight rises again.
 *
 * Hysteresis avoids dawn/dusk thrash (off below OFF_EPS for OFF_HOLD_FRAMES, on above ON_EPS).
 */

export interface EffectGraphBypassState {
  withGodrays: boolean;
  withBloom: boolean;
}

export interface EffectGraphBypassGate {
  /** Current composite wiring — read by `rebuildPostGraph`. */
  readonly state: EffectGraphBypassState;
  /** Evaluate live weights; rebuild when desired wiring differs. */
  sync: () => void;
  /**
   * Immediately clear wiring flags (DEV disable toggles). Does not rebuild —
   * caller should rebuild when any flag changed.
   * @returns true if state changed
   */
  forceOff: (flags: { godrays?: boolean; bloom?: boolean }) => boolean;
}

/** Weight below this starts the off-hold counter. */
export const EFFECT_BYPASS_OFF_EPS = 0.005;
/** Weight above this reconnects immediately. */
export const EFFECT_BYPASS_ON_EPS = 0.01;
/** Frames below OFF_EPS before disconnecting (≈0.5 s at 60 fps). */
export const EFFECT_BYPASS_OFF_HOLD_FRAMES = 30;

export function createEffectGraphBypassGate(options: {
  getGodraysWeight: () => number;
  getBloomWeight: () => number;
  rebuild: () => void;
  initial?: Partial<EffectGraphBypassState>;
}): EffectGraphBypassGate {
  const state: EffectGraphBypassState = {
    withGodrays: options.initial?.withGodrays ?? false,
    withBloom: options.initial?.withBloom ?? true,
  };
  let godraysOffHold = 0;
  let bloomOffHold = 0;

  const step = (
    weight: number,
    currentlyOn: boolean,
    offHold: number,
  ): { on: boolean; offHold: number } => {
    if (currentlyOn) {
      if (weight < EFFECT_BYPASS_OFF_EPS) {
        const next = offHold + 1;
        if (next >= EFFECT_BYPASS_OFF_HOLD_FRAMES) {
          return { on: false, offHold: 0 };
        }
        return { on: true, offHold: next };
      }
      return { on: true, offHold: 0 };
    }
    if (weight > EFFECT_BYPASS_ON_EPS) {
      return { on: true, offHold: 0 };
    }
    return { on: false, offHold: 0 };
  };

  const sync = (): void => {
    const nextG = step(options.getGodraysWeight(), state.withGodrays, godraysOffHold);
    const nextB = step(options.getBloomWeight(), state.withBloom, bloomOffHold);
    godraysOffHold = nextG.offHold;
    bloomOffHold = nextB.offHold;
    if (nextG.on === state.withGodrays && nextB.on === state.withBloom) return;
    state.withGodrays = nextG.on;
    state.withBloom = nextB.on;
    options.rebuild();
  };

  const forceOff = (flags: { godrays?: boolean; bloom?: boolean }): boolean => {
    let changed = false;
    if (flags.godrays && state.withGodrays) {
      state.withGodrays = false;
      godraysOffHold = 0;
      changed = true;
    }
    if (flags.bloom && state.withBloom) {
      state.withBloom = false;
      bloomOffHold = 0;
      changed = true;
    }
    return changed;
  };

  return { state, sync, forceOff };
}
