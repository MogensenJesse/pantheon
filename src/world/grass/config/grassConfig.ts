// src/world/grass/config/grassConfig.ts — grass ring constants and runtime accessors
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import {
  deriveGrassRingsLayout,
  type GrassRingAuthored,
  type GrassRingDerived,
  type GrassRingsDerived,
} from './grassFieldMetrics';

export const GRASS_RING_COUNT = 3 as const;
const WORKGROUP_SIZE = 64;

/** Min |delta|² (m²) before CPU treats the player as moved (~0.01 mm). */
export const GRASS_MOVE_EPS_SQ = 1e-10;

/**
 * After the player stops, keep compacting this long so trail scale recovers
 * per-frame (not in 15-frame pops). Wind lean is evaluated in the draw shader.
 */
export const GRASS_TRAIL_SETTLE_SEC = 0.35;

/** Camera XZ/Y move (m) that counts as a view change for compact. */
export const GRASS_CAMERA_MOVE_POS_M = 0.002;

/** 1 − this ≈ 0.36° of forward-vector change before compacting for frustum. */
export const GRASS_CAMERA_MOVE_FORWARD_DOT = 0.99998;

function grassSource() {
  return import.meta.env.DEV ? devSettings.grass : null;
}

function ringsTuple(
  rings: readonly GrassRingAuthored[],
): [GrassRingAuthored, GrassRingAuthored, GrassRingAuthored] {
  return [rings[0]!, rings[1]!, rings[2]!];
}

export function readGrassRingsLayout(): GrassRingsDerived {
  const g = grassSource() ?? VISUAL.grass;
  return deriveGrassRingsLayout(
    ringsTuple(g.rings),
    g.maxInstancesPerRing,
    g.ringFadeBandM,
    g.ringFadeBandLod12M,
    g.maxBladesPerSide,
    g.ringFadeInLod2M,
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
