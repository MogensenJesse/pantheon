// src/world/grass/config/grassConfig.ts — grass ring constants and runtime accessors
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import {
  deriveGrassRingsLayout,
  type GrassRingDerived,
  type GrassRingsDerived,
  syncAllGrassRingsDerived,
} from './grassFieldMetrics';

export const GRASS_RING_COUNT = 3 as const;
export const WORKGROUP_SIZE = 64;

/** Player moved more than this (m) in XZ before grass compute wraps tile offsets. */
export const GRASS_MOVE_EPS_SQ = 0.02 * 0.02;

/** Force a compact pass while player/camera are static (trail scale recovery). */
export const GRASS_TRAIL_REFRESH_FRAMES = 15;

/** Re-test idle rings that last compacted to zero instances. */
export const GRASS_IDLE_RING_REFRESH_FRAMES = 60;

function grassSource() {
  return import.meta.env.DEV ? devSettings.grass : null;
}

export function readGrassRingsLayout(): GrassRingsDerived {
  const dev = grassSource();
  if (dev) {
    return syncAllGrassRingsDerived(dev.rings, dev.ringDerived, dev.maxInstancesPerRing);
  }
  return deriveGrassRingsLayout(
    VISUAL.grass.rings as [
      (typeof VISUAL.grass.rings)[0],
      (typeof VISUAL.grass.rings)[1],
      (typeof VISUAL.grass.rings)[2],
    ],
    VISUAL.grass.maxInstancesPerRing,
  );
}

export function readGrassRingLayout(ringIndex: number): GrassRingDerived {
  return readGrassRingsLayout().rings[ringIndex]!;
}

export const GRASS_CONFIG = {
  WORKGROUP_SIZE,
  get BLADE_HEIGHT() {
    const dev = grassSource();
    return dev?.bladeHeight ?? VISUAL.grass.bladeHeight;
  },
} as const;
