// src/ui/overlay/beliefPips.ts — what belief looks like in the world
//
//   a faint pip above each believer (and each villager with some belief) near the orb, brighter the
//   more they believe. Nothing is shown while a panel is open.

import type { Camera } from 'three';
import type { Villagers } from '../../world/village/model/types';
import { isModalPanelOpen } from '../kit';
import { createMarkerLayer } from './worldMarkers';

export interface BeliefPipsDeps {
  camera: Camera;
  villagers: Villagers;
  /** Where the orb is. */
  orbPosition: () => { x: number; z: number };
  groundY: (x: number, z: number) => number;
  /** Pips show for villagers within this distance (m) of the orb. */
  pipRangeM: number;
  /** After the meeting the elder shows as a larger pip within `range` (m) of the orb. */
  elder?: { index: () => number; met: () => boolean; rangeM: number };
}

const HEAD_M = 2.15;

export function initBeliefPips(deps: BeliefPipsDeps): () => void {
  const pips = createMarkerLayer(deps.camera, 'po-pip');
  let frame = 0;

  const tick = () => {
    frame = requestAnimationFrame(tick);
    if (isModalPanelOpen()) {
      pips.hideAll();
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
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    pips.dispose();
  };
}
