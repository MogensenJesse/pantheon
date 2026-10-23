// src/dev/runtime/lifeProbe.ts — DEV console hook: window.__pantheonLife

import type { Animals } from '../../life/animals/animals';
import type { AmbientLife } from '../../life/places/ambientLife';
import type { LandmarkKind } from '../../map/MapTypes';
import { installDevHook } from './devHook';

export interface LifeProbeSources {
  ambient: AmbientLife;
  animals: Animals;
  /** Where the orb is (the made-up places are put round it). */
  playerPosition: () => { x: number; z: number };
}

/**
 * Install `window.__pantheonLife`: the life at the places of power and the animals. No shipped map has a landmark
 * placed yet, so `fakePlaces()` stands the five up round the orb; `setPlaceLevel(kind, 1)` holds a place at full
 * whatever the story says (null lets go). Fireflies show at night: scrub the time of day in the DEV panel.
 */
export function initLifeProbe(src: LifeProbeSources): () => void {
  const { ambient, animals } = src;
  return installDevHook('__pantheonLife', {
    /** Where each place's life stands: level now, target, and a held level if any. */
    list: () => ambient.list(),
    setPlaceLevel: (kind: LandmarkKind, level: number | null) => ambient.setPlaceLevel(kind, level),
    /** Puts the places the map lacks in a ring round the orb (or round x, z), each at full. */
    fakePlaces: (x?: number, z?: number, radiusM?: number) => {
      const here = src.playerPosition();
      return ambient.fakePlaces(x ?? here.x, z ?? here.z, radiusM);
    },
    clearFakes: () => ambient.clearFakes(),
    /** How many sheep, hens, flocks and birds there are now. */
    animals: () => animals.counts(),
    /** Have the farm animals now, whatever the village's state. */
    farm: (on = true) => animals.setAlways(on),
  });
}
