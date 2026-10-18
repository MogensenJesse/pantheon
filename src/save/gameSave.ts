// src/save/gameSave.ts — taking a save of the running game, and autosaving it
//
// Nothing here knows the game's modules, only the small interfaces in `GameSaveSources`, so the same
// code runs in the browser and (with stand-ins) in node. The autosaver listens to `document` and
// `window` for leaving the page, so it needs `automatic: false` outside a browser.

import type { VillageSimState } from '../world/village/sim/villageSim.ts';
import { captureProfile, dayOf, type ProfileSources } from './profile.ts';
import type { SaveParts, SaveService } from './saveService.ts';
import type { SlotId, SlotMeta } from './slots.ts';

/** Key of the village sim inside the snapshot's `village` slice (room for the economy, trees, graves). */
export const VILLAGE_SIM_KEY = 'sim';

export interface GameSaveSources extends ProfileSources {
  /** Null when the map has no village. */
  village: { sim: { serialize: () => VillageSimState; villagers: { count: number } } } | null;
  /** Seconds in one game day (the sun's full turn). */
  dayDurationSec: () => number;
  /** Seconds played, across sessions. */
  playSeconds: () => number;
}

/** Everything a save keeps, copied now. */
export function captureGame(src: GameSaveSources): SaveParts {
  const profile = captureProfile(src);
  const sim = src.village?.sim;
  return {
    playSeconds: src.playSeconds(),
    summary: {
      day: dayOf(profile.clocks.elapsed, src.dayDurationSec()),
      population: sim?.villagers.count ?? 0,
    },
    profile,
    village: sim ? { [VILLAGE_SIM_KEY]: sim.serialize() } : {},
  };
}

/** Seconds played: counts only while the tab is visible, and carries on from a loaded save. */
export function createPlayClock(initialSeconds: number): {
  seconds: () => number;
  /** Stop counting while the game is paused. */
  setPaused: (paused: boolean) => void;
  dispose: () => void;
} {
  let total = initialSeconds;
  let last = performance.now();
  let hidden = typeof document !== 'undefined' && document.hidden;
  let paused = false;
  const tick = () => {
    const now = performance.now();
    if (!hidden && !paused) total += (now - last) / 1000;
    last = now;
  };
  const onVisibility = () => {
    tick();
    hidden = document.hidden;
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  return {
    seconds: () => {
      tick();
      return total;
    },
    setPaused: (next) => {
      tick();
      paused = next;
    },
    dispose: () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    },
  };
}

/** Autosave every five minutes of play. */
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;
/** Two automatic saves closer than this are one (hiding the tab and leaving come together). */
const AUTOSAVE_MIN_GAP_MS = 5000;

export type SaveKind = 'auto' | 'manual';

export interface Autosaver {
  /** Save now: into `slot`, or into the older autosave slot when none is given. */
  saveNow: (slot?: SlotId) => Promise<SlotMeta>;
  dispose: () => void;
}

export interface AutosaverOptions {
  service: SaveService;
  /** Takes the save synchronously (it must not wait: the page may be going away). */
  capture: () => SaveParts;
  /** Save by itself (timer, tab hidden, page left). False leaves only `saveNow`. Default true. */
  automatic?: boolean;
  intervalMs?: number;
  /** A write begins (for an indicator). */
  onStart?: (kind: SaveKind) => void;
  onSaved?: (meta: SlotMeta, kind: SaveKind) => void;
  onError?: (err: unknown, kind: SaveKind) => void;
}

/**
 * Saves on a timer, when the tab is hidden and when the page is left. The write is asynchronous, but
 * the state is captured before anything else can change it.
 */
export function createAutosaver(o: AutosaverOptions): Autosaver {
  let inFlight: Promise<SlotMeta> | null = null;
  let lastAutoAt = Number.NEGATIVE_INFINITY;

  const run = (slot: SlotId | undefined, kind: SaveKind): Promise<SlotMeta> => {
    const parts = o.capture();
    o.onStart?.(kind);
    const write = slot ? o.service.save(slot, parts) : o.service.autosave(parts);
    const done = write.then(
      (meta) => {
        o.onSaved?.(meta, kind);
        return meta;
      },
      (err) => {
        o.onError?.(err, kind);
        throw err;
      },
    );
    return done;
  };

  const saveNow = (slot?: SlotId): Promise<SlotMeta> => {
    if (slot) return run(slot, 'manual');
    if (inFlight) return inFlight;
    lastAutoAt = performance.now();
    const pending = run(undefined, 'auto');
    inFlight = pending;
    const clear = () => {
      if (inFlight === pending) inFlight = null;
    };
    pending.then(clear, clear);
    return pending;
  };

  const automatic = () => {
    if (performance.now() - lastAutoAt < AUTOSAVE_MIN_GAP_MS) return;
    // Errors are reported through onError; an automatic save has nobody to reject to.
    saveNow().catch(() => {});
  };

  const onVisibility = () => {
    if (document.hidden) automatic();
  };
  const auto = o.automatic ?? true;
  const timer = auto ? setInterval(automatic, o.intervalMs ?? AUTOSAVE_INTERVAL_MS) : undefined;
  if (auto) {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', automatic);
  }

  return {
    saveNow,
    dispose: () => {
      if (!auto) return;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', automatic);
    },
  };
}
