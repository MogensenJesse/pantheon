// src/dev/panel/lifeHook.ts — the console hook of src/dev/runtime/lifeProbe.ts, typed for the panel buttons
import type { LandmarkKind } from '../../map/MapTypes';

export interface LifeHook {
  fakePlaces: () => LandmarkKind[];
  clearFakes: () => void;
  setPlaceLevel: (kind: LandmarkKind, level: number | null) => boolean;
  farm: (on?: boolean) => void;
}

/** `window.__pantheonLife`, or undefined while the world is not up. */
export const lifeHook = (): LifeHook | undefined =>
  (window as unknown as { __pantheonLife?: LifeHook }).__pantheonLife;
