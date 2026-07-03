// src/editor/tools/PaintBiomeTool.ts — paint biome ids on grid
import { VISUAL } from '../../config/visualTuning';
import { forEachCellInDisc } from '../../map/gridBrush';
import { discGridBounds, type GridDirtyRegion, mergeDirtyRegions } from '../../map/gridDirtyRegion';
import type { BiomeWeightBakeOptions, MapGrids } from '../../map/MapGrids';
import { BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { EditorInputContext } from '../core/EditorInput';
import { createGridBrushFlushLoop } from './gridBrushFlushLoop';

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
    radius: 12,
    biome: BiomeId.Forest,
    hardness: 1,
  };
  let dirty = false;
  let dirtyRegion: GridDirtyRegion | null = null;

  const computeBlurRadiusCells = (): number => {
    const softness = Math.max(0, 1 - options.hardness);
    if (softness <= 0) return 0;
    const baseRadius = VISUAL.terrain.biomeBlendRadiusCells;
    const brushRadiusInCells = (options.radius / worldSize) * grids.size;
    return Math.round(baseRadius * softness + brushRadiusInCells * 0.5 * softness);
  };

  const markDirty = (x: number, z: number) => {
    const bounds = discGridBounds(x, z, options.radius, worldSize, grids.size);
    dirtyRegion = mergeDirtyRegions(dirtyRegion, bounds);
    dirty = true;
  };

  const flushUpload = () => {
    if (!dirty) return;
    uploadBiome({
      blurRadiusCells: computeBlurRadiusCells(),
      region: dirtyRegion ?? undefined,
    });
    dirty = false;
    dirtyRegion = null;
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
    markDirty(x, z);
  };

  const flushLoop = createGridBrushFlushLoop(UPLOAD_INTERVAL_MS, flushUpload, () => dirty);

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
    getOptions: () => options,
    update: (dt) => {
      const pointerDown = input.isPointerDown();
      if (!pointerDown) {
        flushLoop.tick(dt, false, () => {});
        return;
      }

      const hit = input.getHit();
      if (!hit) return;

      flushLoop.tick(dt, true, () => stamp(hit.x, hit.z));
    },
  };
}
