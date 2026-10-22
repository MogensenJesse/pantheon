// src/gameplay/restoration.ts — the orb starts the restoration of a place of power, the village finishes it
// (story-mechanics/PHASE_2_RESTORATION.md)
//
// An awake place of a converted village is offered once the village has the wood. The orb standing at it for
// the dwell time sends a crew (the village sim); when the crew's work is done the place is restored, which pays
// its boon and faith (gameplay/landmarkBoons.ts).

import { PHASE0 } from '../config/phase0';
import { VILLAGE } from '../config/village';
import { bus } from '../core/EventBus';
import type { LandmarkRuntime } from '../landmarks/landmarkRuntime';
import {
  advanceDwell,
  canStartRestoration,
  type DwellState,
  dwellProgress,
  initialLandmarks,
  type LandmarkRules,
} from '../landmarks/landmarks';
import type { LandmarkKind } from '../map/MapTypes';
import type { VillageSystemContext } from '../world/village/VillageSystem';

export interface RestorationDeps {
  landmarks: Pick<LandmarkRuntime, 'places' | 'state' | 'startRestore' | 'finishRestore'>;
  /** Null when the map has no village. */
  village: Pick<VillageSystemContext, 'sim' | 'startRestoration'> | null;
  /** Where the orb is on the ground. */
  orbPlace: () => { x: number; z: number };
}

export type RestorationRefusal = 'busy' | 'no-route' | 'no-crew' | 'no-wood';

export interface RestorationRuntime {
  /** Once per fixed step. */
  update: (dt: number) => void;
  /** Places the orb could start restoring now (awake, village converted, not begun, wood in store). */
  offered: () => readonly LandmarkKind[];
  /** How far the orb's dwell at an offered place has come, 0 to 1. */
  progress: (kind: LandmarkKind) => number;
  /** Starts a restoration at once, as the dwell would (DEV and tests); says why not when it cannot. */
  start: (kind: LandmarkKind) => 'ok' | RestorationRefusal;
  /** Why the last attempt was refused, until the next attempt succeeds. */
  lastRefusal: () => RestorationRefusal | null;
  dispose: () => void;
}

export function initRestoration(deps: RestorationDeps): RestorationRuntime {
  const { landmarks, village } = deps;
  const rules: LandmarkRules = {
    radiusM: PHASE0.LANDMARK.RADIUS_M,
    dwellS: PHASE0.LANDMARK.DWELL_S,
  };
  const { START_WOOD } = VILLAGE.RESTORATION;
  const dwell: DwellState = {};
  let refusal: RestorationRefusal | null = null;

  const offered = (): LandmarkKind[] => {
    if (!village?.sim.converted) return [];
    const state = landmarks.state();
    return landmarks.places
      .filter((p) => canStartRestoration(state, p.kind, true))
      .map((p) => p.kind);
  };

  const refuse = (why: RestorationRefusal): RestorationRefusal => {
    refusal = why;
    return why;
  };

  const start = (kind: LandmarkKind): 'ok' | RestorationRefusal => {
    const place = landmarks.places.find((p) => p.kind === kind);
    if (!village || !place || !offered().includes(kind)) return refuse('busy');
    if (!village.sim.economy.spendWood(START_WOOD)) return refuse('no-wood');
    const result = village.startRestoration(kind, place.x, place.z);
    if (result !== 'ok') {
      village.sim.economy.addWood(START_WOOD);
      return refuse(result);
    }
    landmarks.startRestore(kind, true);
    delete dwell[kind];
    refusal = null;
    return 'ok';
  };

  const offDone = bus.on('village:remoteDone', ({ kind }) => {
    landmarks.finishRestore(kind as LandmarkKind);
  });

  return {
    update: (dt) => {
      const open = offered();
      if (open.length === 0) {
        for (const k of Object.keys(dwell)) delete dwell[k as LandmarkKind];
        return;
      }
      const places = landmarks.places.filter((p) => open.includes(p.kind));
      const { x, z } = deps.orbPlace();
      // Nothing is "awake" in the state handed over, so every offered place counts while the orb is near.
      const arrived = advanceDwell(dwell, places, initialLandmarks(), x, z, dt, rules);
      if (arrived) {
        start(arrived);
        delete dwell[arrived];
      }
    },
    offered,
    progress: (kind) => dwellProgress(dwell, kind, rules),
    start,
    lastRefusal: () => refusal,
    dispose: offDone,
  };
}
