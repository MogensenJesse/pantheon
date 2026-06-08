// src/world/grass/grassConfig.ts — grass ring constants and runtime accessors
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import {
  deriveGrassRingsLayout,
  type GrassRingDerived,
  type GrassRingsDerived,
  syncAllGrassRingsDerived,
} from './grassFieldMetrics';

export const GRASS_RING_COUNT = 3 as const;
export const WORKGROUP_SIZE = 64;

function grassSource() {
  return import.meta.env.DEV ? devSettings.grass : null;
}

export function readGrassRingsLayout(): GrassRingsDerived {
  const dev = grassSource();
  if (dev) {
    return syncAllGrassRingsDerived(dev.rings, dev.maxInstancesPerRing);
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

export function grassTotalInstanceCount(): number {
  return readGrassRingsLayout().totalInstances;
}

export function grassRingInstanceCount(ringIndex: number): number {
  return readGrassRingLayout(ringIndex).instanceCount;
}

export const GRASS_CONFIG = {
  WORKGROUP_SIZE,
  get BLADE_HEIGHT() {
    const dev = grassSource();
    return dev?.bladeHeight ?? VISUAL.grass.bladeHeight;
  },
} as const;
