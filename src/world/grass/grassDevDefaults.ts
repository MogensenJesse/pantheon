// src/world/grass/grassDevDefaults.ts — dev panel defaults for grass scatter tuning
import { PHASE0 } from '../../config/phase0';
import type { GrassDevSettings } from '../../core/GameState';

/** Baseline scatter rules (matches initial AssetScatterer values). */
export const GRASS_SCATTER_DEFAULTS: Omit<GrassDevSettings, 'windStrength' | 'windSpeed' | 'dirty'> = {
  densityMul: 2,
  coverCount: PHASE0.SCATTER.GRASS_COVER_COUNT,
  accentCount: PHASE0.SCATTER.GRASS_ACCENT_COUNT,
  coverMinSpacing: 0.7,
  accentMinSpacing: 2,
  coverHeightMin: 0.25,
  coverHeightMax: 1.75,
  accentHeightMin: 0.35,
  accentHeightMax: 1.1,
  coverScaleMin: 3.5,
  coverScaleMax: 8,
  accentScaleMin: 3,
  accentScaleMax: 5,
};

export function resetGrassScatterDev(grass: GrassDevSettings): void {
  Object.assign(grass, GRASS_SCATTER_DEFAULTS);
}
