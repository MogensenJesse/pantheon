// src/editor/tools/SculptTool.ts — raise/lower height brush on grid
import { VISUAL } from '../../config/visualTuning';
import { forEachCellInDisc } from '../../map/gridBrush';
import {
  discGridBounds,
  expandDirtyRegion,
  type GridDirtyRegion,
  mergeDirtyRegions,
} from '../../map/gridDirtyRegion';
import { smoothRidgeDetail, stampRidgeDetail } from '../../map/heightRidgeStamp';
import type { MapGrids } from '../../map/MapGrids';
import type { EditorInputContext } from '../core/EditorInput';
import { createGridBrushFlushLoop } from './gridBrushFlushLoop';

export type SculptMode = 'bulk' | 'ridge';

export interface SculptToolOptions {
  mode: SculptMode;
  radius: number;
  strength: number;
  ridgeStrength?: number;
  lower: boolean;
}

export interface SculptToolContext {
  setOptions: (opts: Partial<SculptToolOptions>) => void;
  getOptions: () => Readonly<SculptToolOptions>;
  update: (dt: number) => void;
}

const REBUILD_INTERVAL_MS = 100;
const ridgeTuning = VISUAL.editor.ridgeSculpt;

export function createSculptTool(
  grids: MapGrids,
  input: EditorInputContext,
  applyHeights: (region?: GridDirtyRegion) => void,
  worldSize: number,
): SculptToolContext {
  let options: SculptToolOptions = {
    mode: 'bulk',
    radius: 12,
    strength: 0.04,
    ridgeStrength: ridgeTuning.strength,
    lower: false,
  };
  let dirty = false;
  let dirtyRegion: GridDirtyRegion | null = null;

  const markDirty = (x: number, z: number, extraMarginCells = 0) => {
    let bounds = discGridBounds(x, z, options.radius, worldSize, grids.size);
    if (extraMarginCells > 0) {
      bounds = expandDirtyRegion(bounds, extraMarginCells, grids.size);
    }
    dirtyRegion = mergeDirtyRegions(dirtyRegion, bounds);
    dirty = true;
  };

  const flushHeights = () => {
    if (!dirty) return;
    applyHeights(dirtyRegion ?? undefined);
    dirty = false;
    dirtyRegion = null;
  };

  const stampBulk = (x: number, z: number) => {
    const sign = options.lower ? -1 : 1;

    forEachCellInDisc(
      grids,
      x,
      z,
      { radius: options.radius, worldSize },
      (_i, _j, idx, falloff) => {
        grids.height[idx] = Math.max(
          0,
          Math.min(1, grids.height[idx] + sign * options.strength * falloff * 0.15),
        );
      },
    );
    markDirty(x, z);
  };

  const stampRidge = (x: number, z: number) => {
    const noise = {
      frequency: ridgeTuning.frequency,
      octaves: ridgeTuning.octaves,
      lacunarity: ridgeTuning.lacunarity,
      gain: ridgeTuning.gain,
    };
    const ridgeStrength = options.ridgeStrength ?? ridgeTuning.strength;

    if (options.lower) {
      smoothRidgeDetail(grids, x, z, {
        radius: options.radius,
        worldSize,
        strength: ridgeTuning.smoothStrength * (ridgeStrength / ridgeTuning.strength),
        blurRadiusCells: 2,
      });
      markDirty(x, z, 2);
    } else {
      stampRidgeDetail(grids, x, z, {
        radius: options.radius,
        worldSize,
        strength: ridgeStrength,
        noise,
      });
      markDirty(x, z);
    }
  };

  const stamp = (x: number, z: number) => {
    if (options.mode === 'ridge') stampRidge(x, z);
    else stampBulk(x, z);
  };

  const flushLoop = createGridBrushFlushLoop(REBUILD_INTERVAL_MS, flushHeights, () => dirty);

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

      options.lower = input.isShiftDown();
      flushLoop.tick(dt, true, () => stamp(hit.x, hit.z));
    },
  };
}
