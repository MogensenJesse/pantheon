// src/world/terrain/biomeDebugColors.ts — shared false-color palette for biome debug overlay + editor legend
import { BIOME_ID_LABELS, BiomeId, type BiomeIdValue } from '../../map/MapTypes';

/** Linear RGB 0–1 — must match terrainBiomeDebugTsl biomeDebugColor(). */
export const BIOME_DEBUG_RGB: Record<BiomeIdValue, readonly [number, number, number]> = {
  [BiomeId.Water]: [0.15, 0.45, 1.0],
  [BiomeId.Shore]: [1.0, 0.92, 0.25],
  [BiomeId.Forest]: [0.15, 0.95, 0.35],
  [BiomeId.Hills]: [1.0, 0.55, 0.1],
  [BiomeId.Mountain]: [0.95, 0.95, 1.0],
  [BiomeId.Path]: [1.0, 0.2, 1.0],
  [BiomeId.Meadow]: [0.2, 0.95, 0.95],
};

export const BIOME_DEBUG_LEGEND_ORDER: readonly BiomeIdValue[] = [
  BiomeId.Water,
  BiomeId.Shore,
  BiomeId.Forest,
  BiomeId.Hills,
  BiomeId.Mountain,
  BiomeId.Path,
  BiomeId.Meadow,
];

/** Shader-derived overlays (not painted grid IDs). Must match terrainBiomeDebugTsl. */
export const BIOME_DEBUG_ROCK_RGB = [0.58, 0.26, 0.18] as const;
export const BIOME_DEBUG_SNOW_RGB = [0.52, 0.84, 1.0] as const;

export const BIOME_DEBUG_DERIVED_LEGEND: readonly {
  key: 'rock' | 'snow';
  label: string;
  rgb: readonly [number, number, number];
}[] = [
  { key: 'rock', label: 'Rock (steep)', rgb: BIOME_DEBUG_ROCK_RGB },
  { key: 'snow', label: 'Snow', rgb: BIOME_DEBUG_SNOW_RGB },
];

export function biomeDebugCssColor(rgb: readonly [number, number, number]): string {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function biomeDebugLegendLabel(id: BiomeIdValue): string {
  return BIOME_ID_LABELS[id];
}
