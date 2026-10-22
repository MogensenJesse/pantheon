// src/landmarks/landmarkRuntime.ts — wakes the landmarks as the orb stands at them (the fixed step runs this)
//
// The rules are in `landmarks.ts`. This holds the state and the dwell counts, pays the energy a landmark
// gives and says so on the bus (`landmark:awakened`), which the story log and the world reveal listen to.

import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { addEnergy } from '../core/energy';
import type { LandmarkEntity, LandmarkKind } from '../map/MapTypes';
import {
  advanceDwell,
  allAwake,
  awaken,
  canStartRestoration,
  copyLandmarks,
  type DwellState,
  dwellProgress,
  finishRestoration,
  initialLandmarks,
  isAwake,
  isRestored,
  type LandmarkPlace,
  type LandmarkRules,
  type LandmarkState,
  orderOf,
  type RestorationStatus,
  restorationOf,
  restoredCount,
  startRestoration,
  stickyTarget,
} from './landmarks';

export interface LandmarkDeps {
  /** The map's landmarks (none on most test maps). */
  landmarks: readonly LandmarkEntity[];
  /** The landmark state of the save being continued, if any. */
  initial: LandmarkState | undefined;
  /** Where the orb is on the ground. */
  orbPlace: () => { x: number; z: number };
}

export interface LandmarkRuntime {
  places: readonly LandmarkPlace[];
  /** A copy of what is saved. */
  state: () => LandmarkState;
  isAwake: (kind: LandmarkKind) => boolean;
  /** How far the dwell at a dormant landmark has come, 0 to 1 (0 while the orb is away). */
  progress: (kind: LandmarkKind) => number;
  /** The landmark the guide line leads to: the nearest dormant one, kept until it wakes. */
  nextTarget: () => LandmarkPlace | null;
  allAwake: () => boolean;
  /** Where the village's restoration of a place stands, null before it begins. */
  restoration: (kind: LandmarkKind) => RestorationStatus | null;
  isRestored: (kind: LandmarkKind) => boolean;
  /** How many of the map's places the village has restored. */
  restoredCount: () => number;
  /** Begins the restoration of an awake place of this map (needs a converted village); false when it cannot begin. */
  startRestore: (kind: LandmarkKind, villageConverted: boolean) => boolean;
  /** Marks a restoration in progress as done; false when none is in progress there. */
  finishRestore: (kind: LandmarkKind) => boolean;
  /** Wakes a landmark at once (DEV and tests); does nothing for an awake one or a kind this map lacks. */
  awakenNow: (kind: LandmarkKind) => boolean;
  /** Once per fixed step. */
  update: (dt: number) => void;
}

export function initLandmarks(deps: LandmarkDeps): LandmarkRuntime {
  const places: LandmarkPlace[] = deps.landmarks.map((l) => ({ kind: l.kind, x: l.x, z: l.z }));
  const rules: LandmarkRules = {
    radiusM: PHASE0.LANDMARK.RADIUS_M,
    dwellS: PHASE0.LANDMARK.DWELL_S,
  };
  // A save keeps the kinds that were awake; a kind this map no longer has is dropped.
  let current: LandmarkState = {
    awakened: (deps.initial ?? initialLandmarks()).awakened.filter((k) =>
      places.some((p) => p.kind === k),
    ),
    restoration: Object.fromEntries(
      Object.entries((deps.initial ?? initialLandmarks()).restoration).filter(([k]) =>
        places.some((p) => p.kind === k),
      ),
    ),
  };
  const dwell: DwellState = {};
  let target: LandmarkKind | null = null;

  const wake = (kind: LandmarkKind): boolean => {
    if (isAwake(current, kind) || !places.some((p) => p.kind === kind)) return false;
    current = awaken(current, kind);
    delete dwell[kind];
    // The chapter is queued before the energy comes in, so a landmark that fills the bar tells its own
    // story before the sunrise's memory.
    bus.emit('landmark:awakened', {
      kind,
      order: orderOf(current, kind),
      total: places.length,
    });
    addEnergy(PHASE0.LANDMARK.ENERGY);
    return true;
  };

  return {
    places,
    state: () => copyLandmarks(current),
    isAwake: (kind) => isAwake(current, kind),
    progress: (kind) => dwellProgress(dwell, kind, rules),
    nextTarget: () => {
      const { x, z } = deps.orbPlace();
      const place = stickyTarget(places, current, target, x, z);
      target = place?.kind ?? null;
      return place;
    },
    allAwake: () => allAwake(places, current),
    restoration: (kind) => restorationOf(current, kind),
    isRestored: (kind) => isRestored(current, kind),
    restoredCount: () => restoredCount(places, current),
    startRestore: (kind, villageConverted) => {
      if (
        !places.some((p) => p.kind === kind) ||
        !canStartRestoration(current, kind, villageConverted)
      )
        return false;
      current = startRestoration(current, kind);
      bus.emit('landmark:restoreStarted', { kind });
      return true;
    },
    finishRestore: (kind) => {
      const next = finishRestoration(current, kind);
      if (next === current) return false;
      current = next;
      bus.emit('landmark:restored', {
        kind,
        restored: restoredCount(places, current),
        total: places.length,
      });
      return true;
    },
    awakenNow: wake,
    update: (dt) => {
      if (places.length === 0 || allAwake(places, current)) return;
      const { x, z } = deps.orbPlace();
      const arrived = advanceDwell(dwell, places, current, x, z, dt, rules);
      if (arrived) wake(arrived);
    },
  };
}
