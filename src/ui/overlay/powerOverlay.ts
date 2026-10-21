// src/ui/overlay/powerOverlay.ts — what the conversion powers show in the world
//
//   a faint pip above each believer (and each villager with some belief) near the orb, brighter the
//   more they believe; and a ring on the villager or house that the next cast of Murmur or Dream would
//   reach. Nothing is shown while a panel is open.

import type { Camera } from 'three';
import type { Building, Villagers } from '../../world/village/model/types';
import { isModalPanelOpen } from '../kit';
import { createMarkerLayer } from './worldMarkers';

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
  /** After the meeting the elder shows as a larger pip within `range` (m) of the orb. */
  elder?: { index: () => number; met: () => boolean; rangeM: number };
}

const HEAD_M = 2.15;
const BODY_M = 0.9;

export function initPowerOverlay(deps: PowerOverlayDeps): () => void {
  const pips = createMarkerLayer(deps.camera, 'po-pip');
  const rings = createMarkerLayer(deps.camera, 'po-ring');
  let dreamHouse: Building | undefined;
  let frame = 0;

  const tick = () => {
    frame = requestAnimationFrame(tick);
    if (isModalPanelOpen()) {
      pips.hideAll();
      rings.hideAll();
      return;
    }
    const orb = deps.orbPosition();
    const v = deps.villagers;
    pips.begin();
    for (let i = 0; i < v.count; i++) {
      const belief = v.belief[i]!;
      const isElder = !!deps.elder && deps.elder.met() && i === deps.elder.index();
      if ((belief <= 0 && !isElder) || v.indoors[i]) continue;
      const x = v.x[i]!;
      const z = v.z[i]!;
      const range = isElder ? deps.elder!.rangeM : deps.pipRangeM;
      if (Math.hypot(x - orb.x, z - orb.z) > range) continue;
      const pip = pips.add(x, deps.groundY(x, z) + HEAD_M, z, isElder ? 0.4 : 0.22);
      pip.level = isElder ? 0.5 + 0.5 * belief : 0.3 + 0.7 * belief;
      pip.state = belief >= 1 ? 'is-believer' : isElder ? 'is-elder' : undefined;
    }
    pips.flush();

    rings.begin();
    const villager = deps.murmurTarget();
    if (villager >= 0) {
      const x = v.x[villager]!;
      const z = v.z[villager]!;
      const ring = rings.add(x, deps.groundY(x, z) + BODY_M, z, 1.5);
      ring.state = deps.murmurActive() ? 'is-active' : undefined;
    }
    const houseId = deps.dreamTarget();
    if (houseId < 0) dreamHouse = undefined;
    else if (dreamHouse?.id !== houseId) dreamHouse = deps.buildings.find((b) => b.id === houseId);
    if (dreamHouse) {
      rings.add(dreamHouse.x, deps.groundY(dreamHouse.x, dreamHouse.z) + 2, dreamHouse.z, 4.5);
    }
    rings.flush();
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    pips.dispose();
    rings.dispose();
  };
}
