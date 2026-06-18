// src/editor/tools/PaintBiomeTool.ts — paint biome ids on grid
import { VISUAL } from '../../config/visualTuning';
import type { BiomeWeightBakeOptions, MapGrids } from '../../map/MapGrids';
import { BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { EditorInputContext } from '../EditorInput';
import { forEachCellInDisc } from '../../map/gridBrush';

export interface PaintBiomeToolOptions {
  radius: number;
  biome: BiomeIdValue;
  /** 0 = softest edges, 1 = hardest stamp. */
  hardness: number;
}

export interface PaintBiomeToolContext {
  setOptions: (opts: Partial<PaintBiomeToolOptions>) => void;
  getOptions: () => Readonly<PaintBiomeToolOptions>;
  update: (dt: number) => void;
}

const UPLOAD_INTERVAL_MS = 100;

export function createPaintBiomeTool(
  grids: MapGrids,
  input: EditorInputContext,
  uploadBiome: (opts?: BiomeWeightBakeOptions) => void,
  worldSize: number,
): PaintBiomeToolContext {
  let options: PaintBiomeToolOptions = {
    radius: 10,
    biome: BiomeId.Forest,
    hardness: 1,
  };
  let uploadTimer = 0;
  let dirty = false;

  const computeBlurRadiusCells = (): number => {
    const softness = Math.max(0, 1 - options.hardness);
    if (softness <= 0) return 0;
    const baseRadius = VISUAL.terrain.biomeBlendRadiusCells;
    const brushRadiusInCells = (options.radius / worldSize) * grids.size;
    return Math.round(baseRadius * softness + brushRadiusInCells * 0.5 * softness);
  };

  const stamp = (x: number, z: number) => {
    forEachCellInDisc(
      grids,
      x,
      z,
      { radius: options.radius, worldSize },
      (_i, _j, idx, falloff) => {
        if (options.hardness < 1 && falloff < 1 - options.hardness) return;
        grids.biome[idx] = options.biome;
      },
    );
    dirty = true;
  };

  const flushUpload = () => {
    if (!dirty) return;
    uploadBiome({ blurRadiusCells: computeBlurRadiusCells() });
    dirty = false;
  };

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
    getOptions: () => options,
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
