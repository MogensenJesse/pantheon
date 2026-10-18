// src/ui/overlay/powerOverlay.ts — what the conversion powers show in the world
//
//   a faint pip above each believer (and each villager with some belief) near the orb, brighter the
//   more they believe; and a ring on the villager or house that the next cast of Murmur or Dream would
//   reach. Nothing is shown while a panel is open.

import type { Camera } from 'three';
import type { Building, Villagers } from '../../world/village/model/types';
import { isPanelOpen } from '../kit';
import { createMarkerPool, type MarkerSpec } from './worldMarkers';

export interface PowerOverlayDeps {
  camera: Camera;
  villagers: Villagers;
  buildings: readonly Building[];
  /** Where the orb is. */
  orbPosition: () => { x: number; z: number };
  groundY: (x: number, z: number) => number;
  /** Pips show for villagers within this distance (m) of the orb. */
  pipRangeM: number;
  /** The villager Murmur would reach (-1 none or not available); the house Dream would reach. */
  murmurTarget: () => number;
  murmurActive: () => boolean;
  dreamTarget: () => number;
}

const HEAD_M = 2.15;
const BODY_M = 0.9;

export function initPowerOverlay(deps: PowerOverlayDeps): () => void {
  const pips = createMarkerPool(deps.camera, 'po-pip');
  const rings = createMarkerPool(deps.camera, 'po-ring');
  let frame = 0;

  const tick = () => {
    frame = requestAnimationFrame(tick);
    if (isPanelOpen()) {
      pips.hideAll();
      rings.hideAll();
      return;
    }
    const orb = deps.orbPosition();
    const v = deps.villagers;
    const pipSpecs: MarkerSpec[] = [];
    for (let i = 0; i < v.count; i++) {
      const belief = v.belief[i]!;
      if (belief <= 0 || v.indoors[i]) continue;
      const x = v.x[i]!;
      const z = v.z[i]!;
      if (Math.hypot(x - orb.x, z - orb.z) > deps.pipRangeM) continue;
      pipSpecs.push({
        x,
        y: deps.groundY(x, z) + HEAD_M,
        z,
        sizeM: 0.22,
        level: 0.3 + 0.7 * belief,
        state: belief >= 1 ? 'is-believer' : undefined,
      });
    }
    pips.show(pipSpecs);

    const ringSpecs: MarkerSpec[] = [];
    const villager = deps.murmurTarget();
    if (villager >= 0) {
      const x = v.x[villager]!;
      const z = v.z[villager]!;
      ringSpecs.push({
        x,
        y: deps.groundY(x, z) + BODY_M,
        z,
        sizeM: 1.5,
        state: deps.murmurActive() ? 'is-active' : undefined,
      });
    }
    const houseId = deps.dreamTarget();
    const house = houseId >= 0 ? deps.buildings.find((b) => b.id === houseId) : undefined;
    if (house) {
      ringSpecs.push({ x: house.x, y: deps.groundY(house.x, house.z) + 2, z: house.z, sizeM: 4.5 });
    }
    rings.show(ringSpecs);
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    pips.dispose();
    rings.dispose();
  };
}
