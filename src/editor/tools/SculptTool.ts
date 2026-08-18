// src/editor/tools/SculptTool.ts — raise/lower/soften height brush on sculpt base
import { VISUAL } from '../../config/visualTuning';
import { forEachCellInDisc } from '../../map/authoring/gridBrush';
import {
  discGridBounds,
  expandDirtyRegion,
  type GridDirtyRegion,
  mergeDirtyRegions,
} from '../../map/authoring/gridDirtyRegion';
import { smoothHeightInDisc } from '../../map/authoring/heightSmoothDisc';
import type { MapGrids } from '../../map/MapGrids';
import type { EditorInputContext } from '../core/EditorInput';
import { createGridBrushFlushLoop } from './gridBrushFlushLoop';

/**
 * Preview/final = derive display height from sculpt base.
 * Soften = box-blur display height (no Quilez re-stamp).
 */
export type SculptFlushQuality = 'preview' | 'final' | 'soften';

export interface SculptToolOptions {
  radius: number;
  strength: number;
  /** Sticky soften from toolbar checkbox. */
  soften: boolean;
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
  /** Soft massing (seed) written by the raise/lower brush. */
  sculptBase: Float32Array;
  input: EditorInputContext;
  /** Preview/final pass dirty region; soften skips derive. */
  onFlush: (region: GridDirtyRegion | undefined, quality: SculptFlushQuality) => void;
  worldSize: number;
}

const REBUILD_INTERVAL_MS = 100;
const smoothStrength = VISUAL.editor.sculpt.smoothStrength;

export function createSculptTool(deps: SculptToolDeps): SculptToolContext {
  const { grids, sculptBase, input, onFlush, worldSize } = deps;

  let options: SculptToolOptions = {
    radius: 12,
    strength: 0.04,
    soften: false,
    lower: false,
  };
  let dirty = false;
  let dirtyRegion: GridDirtyRegion | null = null;
  /** Union of all dabs in the current pointer gesture (undo AABB). */
  let strokeRegion: GridDirtyRegion | null = null;
  /** True when the dirty stroke used display-height soften (not base raise/lower). */
  let softenStroke = false;

  const markDirty = (x: number, z: number, extraMarginCells = 0) => {
    let bounds = discGridBounds(x, z, options.radius, worldSize, grids.size);
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
    const pointerDown = input.isPointerDown();
    if (softenStroke) {
      onFlush(region, 'soften');
    } else {
      onFlush(region, pointerDown ? 'preview' : 'final');
    }
    dirty = false;
    dirtyRegion = null;
    if (!pointerDown) softenStroke = false;
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
        sculptBase[idx] = Math.max(
          0,
          Math.min(1, sculptBase[idx]! + sign * options.strength * falloff * 0.15),
        );
      },
    );
    markDirty(x, z);
  };

  const stampSoften = (x: number, z: number) => {
    // Soften: box-blur display heights (Quilez detail), not the flat massing base.
    softenStroke = true;
    smoothHeightInDisc(grids.height, grids, x, z, {
      radius: options.radius,
      worldSize,
      strength: smoothStrength,
      blurRadiusCells: 2,
    });
    markDirty(x, z, 2);
  };

  const stamp = (x: number, z: number) => {
    const soften = options.soften || input.isAltDown();
    if (soften) stampSoften(x, z);
    else stampRaiseLower(x, z);
  };

  const flushLoop = createGridBrushFlushLoop(REBUILD_INTERVAL_MS, flushHeights, () => dirty);

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
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
