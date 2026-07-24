// src/rendering/postfx/effectGraphBypass.ts — disconnect zero-weight god rays / bloom from the post graph
/**
 * When a mix weight is ~0, the upstream BloomNode / GodraysNode passes still run if they
 * stay referenced in the composite Fn. This gate queues composite rebuilds without those
 * references after a short hold, and reconnects when weight rises again.
 *
 * Rebuilds are flushed from `postFX.render()` (not mid-frame during sync) so a reconnect
 * does not clear the canvas to the CSS background before the next present.
 *
 * Hysteresis avoids dawn/dusk thrash (off below OFF_EPS for OFF_HOLD_FRAMES, on above ON_EPS).
 */

export interface EffectGraphBypassState {
  withGodrays: boolean;
  withBloom: boolean;
}

export interface EffectGraphFlushResult {
  rebuilt: boolean;
  /** True when this flush turned god rays from disconnected → connected. */
  godraysReconnected: boolean;
}

export interface EffectGraphBypassGate {
  /** Current composite wiring — live graph until `flushPending` applies a pending change. */
  readonly state: EffectGraphBypassState;
  /** Evaluate live weights; queue wiring when desired differs (no rebuild here). */
  sync: () => void;
  /**
   * Immediately clear wiring flags (DEV disable toggles). Does not rebuild —
   * caller should rebuild when any flag changed.
   * @returns true if state changed
   */
  forceOff: (flags: { godrays?: boolean; bloom?: boolean }) => boolean;
  /** Queue composite wiring (startup warmup / tests). Does not rebuild until `flushPending`. */
  setWiring: (next: EffectGraphBypassState) => void;
  /**
   * Apply pending wiring and run `rebuild` when it differs from `state`.
   */
  flushPending: () => EffectGraphFlushResult;
}

/** Weight below this starts the off-hold counter. */
export const EFFECT_BYPASS_OFF_EPS = 0.005;
/** Weight above this reconnects immediately. */
export const EFFECT_BYPASS_ON_EPS = 0.01;
/** Frames below OFF_EPS before disconnecting (≈0.5 s at 60 fps). */
export const EFFECT_BYPASS_OFF_HOLD_FRAMES = 30;

function wiringEqual(a: EffectGraphBypassState, b: EffectGraphBypassState): boolean {
  return a.withGodrays === b.withGodrays && a.withBloom === b.withBloom;
}

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
  let pending: EffectGraphBypassState | null = null;
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

  const queueDesired = (desired: EffectGraphBypassState): void => {
    if (wiringEqual(desired, state)) {
      pending = null;
      return;
    }
    if (pending && wiringEqual(pending, desired)) return;
    pending = { withGodrays: desired.withGodrays, withBloom: desired.withBloom };
  };

  const sync = (): void => {
    const nextG = step(options.getGodraysWeight(), state.withGodrays, godraysOffHold);
    const nextB = step(options.getBloomWeight(), state.withBloom, bloomOffHold);
    godraysOffHold = nextG.offHold;
    bloomOffHold = nextB.offHold;
    queueDesired({ withGodrays: nextG.on, withBloom: nextB.on });
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
    if (changed) pending = null;
    return changed;
  };

  const setWiring = (next: EffectGraphBypassState): void => {
    godraysOffHold = 0;
    bloomOffHold = 0;
    queueDesired(next);
  };

  const flushPending = (): EffectGraphFlushResult => {
    if (!pending) return { rebuilt: false, godraysReconnected: false };
    if (wiringEqual(pending, state)) {
      pending = null;
      return { rebuilt: false, godraysReconnected: false };
    }
    const godraysReconnected = !state.withGodrays && pending.withGodrays;
    state.withGodrays = pending.withGodrays;
    state.withBloom = pending.withBloom;
    pending = null;
    godraysOffHold = 0;
    bloomOffHold = 0;
    options.rebuild();
    return { rebuilt: true, godraysReconnected };
  };

  return { state, sync, forceOff, setWiring, flushPending };
}
