// src/editor/tools/SculptTool.ts — raise/lower, soften, and ridge-detail height brushes
import { forEachCellInDisc } from '../../map/authoring/gridBrush';
import {
  discGridBounds,
  expandDirtyRegion,
  type GridDirtyRegion,
  gridRegionIsEmpty,
  mergeDirtyRegions,
} from '../../map/authoring/gridDirtyRegion';
import { smoothHeightInDisc } from '../../map/authoring/heightSmoothDisc';
import type { MapGrids } from '../../map/MapGrids';
import { clampHeightNorm } from '../../map/mapHeightBounds';
import type { EditorInputContext } from '../core/EditorInput';
import { createGridBrushFlushLoop } from './gridBrushFlushLoop';

/** Direct = CPU height already written (raise/lower/ridge). Soften also writes height then bakes base. */
export type SculptFlushQuality = 'direct' | 'soften';

export interface SculptToolOptions {
  radius: number;
  strength: number;
  /** Sticky soften from toolbar checkbox. */
  soften: boolean;
  /** When true, LMB adds ridge detail in place (inverse of Soften; exclusive with it). */
  ridge: boolean;
  lower: boolean;
}

export interface SculptToolContext {
  setOptions: (opts: Partial<SculptToolOptions>) => void;
  getOptions: () => Readonly<SculptToolOptions>;
  beginStroke: () => void;
  getStrokeRegion: () => GridDirtyRegion | undefined;
  update: (dt: number) => void;
}

export interface SculptToolDeps {
  grids: MapGrids;
  sculptBase: Float32Array;
  input: EditorInputContext;
  onFlush: (region: GridDirtyRegion | undefined, quality: SculptFlushQuality) => void;
  worldSize: number;
  sampleRidge: (worldX: number, worldZ: number) => number;
}

const REBUILD_INTERVAL_MS = 100;
/** Maps sculpt strength (0.01–0.20 from the Strength slider) into soften blend (≤1). */
const SOFTEN_STRENGTH_MUL = 5;
/** Peak |delta| at strength 1 before falloff (normalized height). Scaled for zero-mean Quilez. */
const RIDGE_AMP = 1.1;

export function createSculptTool(deps: SculptToolDeps): SculptToolContext {
  const { grids, sculptBase, input, onFlush, worldSize, sampleRidge } = deps;

  let options: SculptToolOptions = {
    radius: 12,
    strength: 0.04,
    soften: false,
    ridge: false,
    lower: false,
  };
  let dirty = false;
  let dirtyRegion: GridDirtyRegion | null = null;
  /** Union of all dabs in the current pointer gesture (undo AABB). */
  let strokeRegion: GridDirtyRegion | null = null;
  let softenStroke = false;

  const markDirty = (x: number, z: number, extraMarginCells = 0) => {
    let bounds = discGridBounds(x, z, options.radius, worldSize, grids.size);
    if (gridRegionIsEmpty(bounds)) return;
    if (extraMarginCells > 0) {
      bounds = expandDirtyRegion(bounds, extraMarginCells, grids.size);
    }
    dirtyRegion = mergeDirtyRegions(dirtyRegion, bounds);
    strokeRegion = mergeDirtyRegions(strokeRegion, bounds);
    dirty = true;
  };

  const flushHeights = () => {
    if (!dirty) return;
    const region = dirtyRegion ?? undefined;
    onFlush(region, softenStroke ? 'soften' : 'direct');
    dirty = false;
    dirtyRegion = null;
    if (!input.isPointerDown()) softenStroke = false;
  };

  const stampRaiseLower = (x: number, z: number) => {
    softenStroke = false;
    const sign = options.lower ? -1 : 1;

    forEachCellInDisc(
      grids,
      x,
      z,
      { radius: options.radius, worldSize },
      (_i, _j, idx, falloff) => {
        const next = clampHeightNorm(grids.height[idx]! + sign * options.strength * falloff * 0.15);
        grids.height[idx] = next;
        sculptBase[idx] = next;
      },
    );
    markDirty(x, z);
  };

  const stampRidge = (x: number, z: number) => {
    softenStroke = false;
    const sign = options.lower ? -1 : 1;
    const max = Math.max(1, grids.size - 1);

    type RidgeCell = { idx: number; falloff: number; q: number };
    const cells: RidgeCell[] = [];
    let weightSum = 0;
    let weightedQ = 0;

    forEachCellInDisc(grids, x, z, { radius: options.radius, worldSize }, (i, j, idx, falloff) => {
      const worldX = ((i + 0.5) / max - 0.5) * worldSize;
      const worldZ = ((j + 0.5) / max - 0.5) * worldSize;
      const q = sampleRidge(worldX, worldZ);
      cells.push({ idx, falloff, q });
      weightSum += falloff;
      weightedQ += q * falloff;
    });

    // Subtract the brush-local mean so the stamp adds variance (ridges/gullies)
    // without lifting or sinking the existing landform — inverse of Soften.
    const mean = weightSum > 0 ? weightedQ / weightSum : 0.5;
    for (const cell of cells) {
      const detail = cell.q - mean;
      const next = clampHeightNorm(
        grids.height[cell.idx]! + sign * detail * options.strength * cell.falloff * RIDGE_AMP,
      );
      grids.height[cell.idx] = next;
      sculptBase[cell.idx] = next;
    }
    markDirty(x, z);
  };

  const stampSoften = (x: number, z: number) => {
    softenStroke = true;
    smoothHeightInDisc(grids.height, grids, x, z, {
      radius: options.radius,
      worldSize,
      strength: Math.min(1, options.strength * SOFTEN_STRENGTH_MUL),
      blurRadiusCells: 2,
    });
    markDirty(x, z, 2);
  };

  const stamp = (x: number, z: number) => {
    const soften = options.soften || input.isAltDown();
    if (soften) stampSoften(x, z);
    else if (options.ridge) stampRidge(x, z);
    else stampRaiseLower(x, z);
  };

  const flushLoop = createGridBrushFlushLoop(REBUILD_INTERVAL_MS, flushHeights, () => dirty);

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
      if (options.soften && options.ridge) {
        if (opts.soften) options.ridge = false;
        else options.soften = false;
      }
    },
    getOptions: () => options,
    beginStroke: () => {
      strokeRegion = null;
    },
    getStrokeRegion: () => strokeRegion ?? undefined,
    update: (dt) => {
      const pointerDown = input.isPointerDown();
      if (!pointerDown) {
        flushLoop.tick(dt, false, () => {});
        return;
      }

      const hit = input.getHit();
      if (!hit) return;

      options.lower = input.isShiftDown();
      const soften = options.soften || input.isAltDown();
      flushLoop.tick(dt, true, () => stamp(hit.x, hit.z), soften);
    },
  };
}
