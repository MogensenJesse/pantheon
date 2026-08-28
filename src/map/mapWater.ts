// src/map/mapWater.ts — per-map water plane vs WORLD.BIOMES.WATER fallback
import { WORLD } from '../config/world.ts';
import type { MapWaterSettings } from './MapTypes.ts';

export function defaultWaterLevelM(): number {
  return WORLD.BIOMES.WATER.max * WORLD.HEIGHT_SCALE;
}

export function resolveMapWaterLevelM(water: MapWaterSettings | undefined): number {
  const v = water?.levelM;
  return typeof v === 'number' && Number.isFinite(v) ? v : defaultWaterLevelM();
}

export function waterHeightNormFromLevelM(levelM: number): number {
  return levelM / WORLD.HEIGHT_SCALE;
}

export function resolveMapWaterHeightNorm(water: MapWaterSettings | undefined): number {
  return waterHeightNormFromLevelM(resolveMapWaterLevelM(water));
}
