// src/world/grass/config/flowerConfig.ts — single flower field (player out to LOD1 outer edge)
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { readGrassRingLayout } from './grassConfig';

/** One flower ring covering near + mid grass bands (through LOD1 outer edge, including fade). */
export const FLOWER_GRASS_RING_END = 1 as const;

const MIN_FLOWERS_PER_SIDE = 8;
const MAX_FLOWERS_PER_SIDE = 64;

export interface FlowerRingDerived {
  flowersPerSide: number;
  instanceCount: number;
  tileSize: number;
  outerRadius: number;
}

export interface FlowerSettings {
  enabled: boolean;
  flowersPerSide: number;
  minScale: number;
  maxScale: number;
  grassThreshold: number;
  color1: string;
  color2: string;
  colorStrength: number;
  heightOffset: number;
  alphaTest: number;
}

function flowerSource(): FlowerSettings {
  if (import.meta.env.DEV) return devSettings.grass.flowers;
  return VISUAL.grass.flowers as FlowerSettings;
}

export function readFlowerSettings(): FlowerSettings {
  return flowerSource();
}

export function flowersEnabled(): boolean {
  return readFlowerSettings().enabled;
}

function clampFlowersPerSide(value: number): number {
  return Math.max(MIN_FLOWERS_PER_SIDE, Math.min(MAX_FLOWERS_PER_SIDE, Math.round(value)));
}

/** Single flower field: player out to the LOD1 cull outer, hard edge (no fade). */
export function readFlowerLayout(): FlowerRingDerived {
  const flowers = readFlowerSettings();
  const outerRadius = readGrassRingLayout(FLOWER_GRASS_RING_END).outerRadius;
  const flowersPerSide = clampFlowersPerSide(flowers.flowersPerSide);
  return {
    flowersPerSide,
    instanceCount: flowersPerSide * flowersPerSide,
    tileSize: outerRadius * 2,
    outerRadius,
  };
}
