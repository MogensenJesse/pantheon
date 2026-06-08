// src/world/grass/flowers/flowerConfig.ts — single flower field (LOD0 + LOD1 span)
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { readGrassRingLayout } from '../grassConfig';

/** One flower ring covering near + mid grass bands (through LOD1 outer edge). */
export const FLOWER_GRASS_RING_END = 1 as const;

const MIN_FLOWERS_PER_SIDE = 8;
const MAX_FLOWERS_PER_SIDE = 64;

export interface FlowerRingDerived {
  flowersPerSide: number;
  instanceCount: number;
  tileSize: number;
  innerRadius: number;
  outerRadius: number;
  flowerSpacing: number;
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
}

export function cloneFlowerSettings(source: {
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
}): FlowerSettings {
  return {
    enabled: source.enabled,
    flowersPerSide: source.flowersPerSide,
    minScale: source.minScale,
    maxScale: source.maxScale,
    boundsRadius: source.boundsRadius,
    grassThreshold: source.grassThreshold,
    color1: source.color1,
    color2: source.color2,
    colorStrength: source.colorStrength,
    heightOffset: source.heightOffset,
  };
}

function flowerSource(): FlowerSettings {
  if (import.meta.env.DEV) return devSettings.grass.flowers;
  return cloneFlowerSettings(VISUAL.grass.flowers);
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

/** Single flower field: inner 0 → LOD1 cumulative outer (~47 m default). */
export function readFlowerLayout(): FlowerRingDerived {
  const flowers = readFlowerSettings();
  const grassMid = readGrassRingLayout(FLOWER_GRASS_RING_END);
  const flowersPerSide = clampFlowersPerSide(flowers.flowersPerSide);
  const outerRadius = grassMid.outerRadius;
  const tileSize = outerRadius * 2;
  const flowerSpacing = tileSize / flowersPerSide;
  return {
    flowersPerSide,
    instanceCount: flowersPerSide * flowersPerSide,
    tileSize,
    innerRadius: 0,
    outerRadius,
    flowerSpacing,
  };
}

export function readFlowerWorldSpacing(
  referenceFlowersPerSide = readFlowerSettings().flowersPerSide,
): number {
  const layout = readFlowerLayout();
  const side = Math.max(MIN_FLOWERS_PER_SIDE, referenceFlowersPerSide);
  return layout.tileSize / side;
}

export const FLOWER_CONFIG = {
  WORKGROUP_SIZE: 64,
  ALPHA_TEST: 0.15,
  MIN_FLOWERS_PER_SIDE,
  MAX_FLOWERS_PER_SIDE,
} as const;
