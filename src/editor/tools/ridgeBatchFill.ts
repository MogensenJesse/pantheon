// src/editor/tools/ridgeBatchFill.ts — one-shot mountain ridge detail from toolbar
import { VISUAL } from '../../config/visualTuning';
import { applyRidgeDetailToBiome } from '../../map/heightRidgeStamp';
import type { MapGrids } from '../../map/MapGrids';
import { BiomeId } from '../../map/MapTypes';
import { WORLD } from '../../world/WorldConfig';

export function fillMountainRidgeDetail(grids: MapGrids, ridgeStrength: number): void {
  const cfg = VISUAL.editor.ridgeSculpt;
  applyRidgeDetailToBiome(grids, {
    worldSize: WORLD.SIZE,
    strength: ridgeStrength,
    noise: {
      frequency: cfg.frequency,
      octaves: cfg.octaves,
      lacunarity: cfg.lacunarity,
      gain: cfg.gain,
    },
    biomeIds: [BiomeId.Mountain],
  });
}
