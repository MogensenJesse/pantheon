// src/world/grass/config/flowerConfig.ts — single flower field (LOD0 + LOD1 span)
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
  innerRadius: number;
  outerRadius: number;
  fadeBandM: number;
  fadeInBandM: number;
}

export interface FlowerSettings {
  enabled: boolean;
  flowersPerSide: number;
  minScale: number;
  maxScale: number;
  boundsRadius: number;
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

/** Single flower field: inner 0 → LOD1 cull outer. Compute spacing is tileSize / clamped side. */
export function readFlowerLayout(): FlowerRingDerived {
  const flowers = readFlowerSettings();
  const grassMid = readGrassRingLayout(FLOWER_GRASS_RING_END);
  const flowersPerSide = clampFlowersPerSide(flowers.flowersPerSide);
  const outerRadius = grassMid.outerRadius;
  const tileSize = outerRadius * 2;
  return {
    flowersPerSide,
    instanceCount: flowersPerSide * flowersPerSide,
    tileSize,
    innerRadius: 0,
    outerRadius,
    fadeBandM: grassMid.fadeBandM,
    fadeInBandM: grassMid.fadeInBandM,
  };
}

export const FLOWER_CONFIG = {
  WORKGROUP_SIZE: 64,
  MIN_FLOWERS_PER_SIDE,
  MAX_FLOWERS_PER_SIDE,
} as const;
