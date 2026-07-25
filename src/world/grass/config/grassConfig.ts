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

/** Min |delta|² (m²) before grass re-wraps tiles / treats player as moved (~0.01 mm). */
export const GRASS_MOVE_EPS_SQ = 1e-10;

/**
 * While player/camera are static, run a compact pass every N frames
 * (trail scale recovery). Cadence — not a latch.
 */
export const GRASS_TRAIL_REFRESH_FRAMES = 15;

/**
 * While static, re-test rings that last compacted to zero every N frames
 * (and schedule a compact-count readback). Cadence — not a latch.
 */
export const GRASS_IDLE_RING_REFRESH_FRAMES = 60;

/**
 * While the player is static and only the camera frustum changed, compact every N frames.
 * 1 = every camera-move frame (throttle off). Experimental — watch frustum-edge pop.
 */
export const GRASS_CAMERA_ONLY_COMPACT_EVERY_N = 2;

function grassSource() {
  return import.meta.env.DEV ? devSettings.grass : null;
}

export function readGrassRingsLayout(): GrassRingsDerived {
  const dev = grassSource();
  if (dev) {
    return syncAllGrassRingsDerived(
      dev.rings,
      dev.ringDerived,
      dev.maxInstancesPerRing,
      dev.ringFadeBandM,
      dev.ringFadeBandLod12M,
      dev.maxBladesPerSide,
      dev.ringFadeInLod2M,
    );
  }
  return deriveGrassRingsLayout(
    VISUAL.grass.rings as [
      (typeof VISUAL.grass.rings)[0],
      (typeof VISUAL.grass.rings)[1],
      (typeof VISUAL.grass.rings)[2],
    ],
    VISUAL.grass.maxInstancesPerRing,
    VISUAL.grass.ringFadeBandM,
    VISUAL.grass.ringFadeBandLod12M,
    VISUAL.grass.maxBladesPerSide,
    VISUAL.grass.ringFadeInLod2M,
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
