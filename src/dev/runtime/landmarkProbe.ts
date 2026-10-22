// src/dev/runtime/landmarkProbe.ts — DEV console hook: window.__pantheonLandmarks

import type { RestorationRuntime } from '../../gameplay/restoration';
import type { LandmarkRuntime } from '../../landmarks/landmarkRuntime';
import type { LandmarkKind } from '../../map/MapTypes';
import { installDevHook } from './devHook';

export interface LandmarkProbeSources {
  landmarks: LandmarkRuntime;
  restoration: RestorationRuntime;
  /** Finishes a restoration under way at once (null without a village). */
  finishRestoration: ((kind: LandmarkKind) => boolean) | null;
  /** Moves the orb to (x, z). */
  teleport: (x: number, z: number) => void;
}

/**
 * Install `window.__pantheonLandmarks`: where the landmarks are and which are awake, wake one at once, walk the
 * orb to one, and read the dwell and the guide line's target. Returns a disposer that removes the hook.
 */
export function initLandmarkProbe(src: LandmarkProbeSources): () => void {
  const { landmarks, restoration, teleport } = src;
  const place = (kind: LandmarkKind) => landmarks.places.find((p) => p.kind === kind);
  return installDevHook('__pantheonLandmarks', {
    list: () =>
      landmarks.places.map((p) => ({
        ...p,
        awake: landmarks.isAwake(p.kind),
        progress: landmarks.progress(p.kind),
      })),
    state: () => landmarks.state(),
    allAwake: () => landmarks.allAwake(),
    /** The landmark the guide line would lead to once the orbs are gone. */
    nextTarget: () => landmarks.nextTarget(),
    awaken: (kind: LandmarkKind) => landmarks.awakenNow(kind),
    /** Wakes every landmark of the map, in the map's order. */
    awakenAll: () => landmarks.places.map((p) => landmarks.awakenNow(p.kind)),
    /** The village's restoration of the places: which are offered, begin one, finish one at once. */
    restoration: {
      offered: () => restoration.offered(),
      progress: (kind: LandmarkKind) => restoration.progress(kind),
      lastRefusal: () => restoration.lastRefusal(),
      start: (kind: LandmarkKind) => restoration.start(kind),
      finish: (kind: LandmarkKind) => src.finishRestoration?.(kind) ?? false,
    },
    /** Puts the orb a few metres from the landmark (inside its reach). */
    teleportTo: (kind: LandmarkKind, offsetM = 2) => {
      const p = place(kind);
      if (!p) return false;
      teleport(p.x + offsetM, p.z);
      return true;
    },
  });
}
