// src/editor/tools/SculptTool.ts — raise/lower height brush on grid
import type { MapGrids } from '../../map/MapGrids';
import type { EditorInputContext } from '../EditorInput';
import { forEachCellInDisc } from './gridBrush';

export interface SculptToolOptions {
  radius: number;
  strength: number;
  lower: boolean;
}

export interface SculptToolContext {
  setOptions: (opts: Partial<SculptToolOptions>) => void;
  getOptions: () => Readonly<SculptToolOptions>;
  update: (dt: number) => void;
}

const REBUILD_INTERVAL_MS = 100;

export function createSculptTool(
  grids: MapGrids,
  input: EditorInputContext,
  applyHeights: () => void,
  worldSize: number,
): SculptToolContext {
  let options: SculptToolOptions = { radius: 12, strength: 0.04, lower: false };
  let rebuildTimer = 0;
  let dirty = false;

  const stamp = (x: number, z: number) => {
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
    dirty = true;
  };

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
    getOptions: () => options,
    update: (dt) => {
      if (!input.isPointerDown()) {
        if (dirty && rebuildTimer <= 0) {
          applyHeights();
          dirty = false;
        }
        return;
      }

      const hit = input.getHit();
      if (!hit) return;

      options.lower = input.isShiftDown();
      stamp(hit.x, hit.z);

      rebuildTimer -= dt * 1000;
      if (rebuildTimer <= 0) {
        applyHeights();
        rebuildTimer = REBUILD_INTERVAL_MS;
        dirty = false;
      }
    },
  };
}
