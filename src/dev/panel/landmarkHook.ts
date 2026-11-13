// src/dev/panel/landmarkHook.ts — the console hook of src/dev/runtime/landmarkProbe.ts, typed for the panel buttons
import type { LandmarkKind } from '../../map/MapTypes';

export interface LandmarkHook {
  /** The landmarks the map places. */
  list: () => Array<{ kind: LandmarkKind }>;
  /** Wakes every landmark of the map. */
  awakenAll: () => unknown;
  /** Puts the orb `offsetM` metres east of a landmark; false when the map does not place that kind. */
  teleportTo: (kind: LandmarkKind, offsetM?: number) => boolean;
}

/** `window.__pantheonLandmarks`, or undefined while the world is not up. */
export const landmarkHook = (): LandmarkHook | undefined =>
  (window as unknown as { __pantheonLandmarks?: LandmarkHook }).__pantheonLandmarks;
