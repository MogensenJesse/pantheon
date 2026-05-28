// src/editor/tools/PaintBiomeTool.ts — paint biome ids on grid
import { BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { MapGrids } from '../../map/MapGrids';
import { worldToGridFrac } from '../../map/MapGrids';
import type { EditorInputContext } from '../EditorInput';

export interface PaintBiomeToolOptions {
  radius: number;
  biome: BiomeIdValue;
}

export interface PaintBiomeToolContext {
  setOptions: (opts: Partial<PaintBiomeToolOptions>) => void;
  update: () => void;
}

export function createPaintBiomeTool(
  grids: MapGrids,
  input: EditorInputContext,
  uploadBiome: () => void,
  worldSize: number,
): PaintBiomeToolContext {
  let options: PaintBiomeToolOptions = {
    radius: 10,
    biome: BiomeId.Forest,
  };

  const stamp = (x: number, z: number) => {
    const { u, v } = worldToGridFrac(x, z, worldSize, grids.size);
    const rCells = (options.radius / worldSize) * grids.size;
    const iCenter = Math.round(u);
    const jCenter = Math.round(v);
    const r2 = rCells * rCells;

    for (let j = 0; j < grids.size; j++) {
      for (let i = 0; i < grids.size; i++) {
        const di = i - iCenter;
        const dj = j - jCenter;
        if (di * di + dj * dj > r2) continue;
        grids.biome[j * grids.size + i] = options.biome;
      }
    }
    uploadBiome();
  };

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
    update: () => {
      if (!input.isPointerDown()) return;
      const hit = input.getHit();
      if (!hit) return;
      stamp(hit.x, hit.z);
    },
  };
}
