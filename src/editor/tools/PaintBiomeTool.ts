// src/editor/tools/PaintBiomeTool.ts — paint biome ids on grid
import type { MapGrids } from '../../map/MapGrids';
import { BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { EditorInputContext } from '../EditorInput';
import { forEachCellInDisc } from './gridBrush';

export interface PaintBiomeToolOptions {
  radius: number;
  biome: BiomeIdValue;
}

export interface PaintBiomeToolContext {
  setOptions: (opts: Partial<PaintBiomeToolOptions>) => void;
  update: (dt: number) => void;
}

const UPLOAD_INTERVAL_MS = 100;

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
  let uploadTimer = 0;
  let dirty = false;

  const stamp = (x: number, z: number) => {
    forEachCellInDisc(
      grids,
      x,
      z,
      { radius: options.radius, worldSize },
      (_i, _j, idx) => {
        grids.biome[idx] = options.biome;
      },
    );
    dirty = true;
  };

  const flushUpload = () => {
    if (!dirty) return;
    uploadBiome();
    dirty = false;
  };

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
    update: (dt) => {
      if (!input.isPointerDown()) {
        if (dirty && uploadTimer <= 0) flushUpload();
        return;
      }

      const hit = input.getHit();
      if (!hit) return;

      stamp(hit.x, hit.z);

      uploadTimer -= dt * 1000;
      if (uploadTimer <= 0) {
        flushUpload();
        uploadTimer = UPLOAD_INTERVAL_MS;
      }
    },
  };
}
