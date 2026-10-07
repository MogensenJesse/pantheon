// src/world/village/model/seed.ts — where and how a village is founded (pure, no three)
import { VILLAGE } from '../../../config/village.ts';

export interface VillageSeed {
  x: number;
  z: number;
  rotY: number;
  radiusM: number;
  /** RNG seed. */
  id: number;
}

/** The fields a map's `villageSeed` entity (or a DEV override) may carry; the rest default. */
export interface VillageSeedSource {
  x: number;
  z: number;
  rotY?: number;
  radiusM?: number;
  seed?: number;
}

export function makeVillageSeed(source: VillageSeedSource): VillageSeed {
  return {
    x: source.x,
    z: source.z,
    rotY: source.rotY ?? 0,
    radiusM: source.radiusM ?? VILLAGE.SEED.DEFAULT_RADIUS_M,
    id: source.seed ?? VILLAGE.SEED.DEFAULT,
  };
}
