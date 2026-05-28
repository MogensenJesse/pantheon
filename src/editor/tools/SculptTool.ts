// src/editor/tools/SculptTool.ts — raise/lower height brush on grid
import type { MapGrids } from '../../map/MapGrids';
import { worldToGridFrac } from '../../map/MapGrids';
import type { EditorInputContext } from '../EditorInput';

export interface SculptToolOptions {
  radius: number;
  strength: number;
  lower: boolean;
}

export interface SculptToolContext {
  setOptions: (opts: Partial<SculptToolOptions>) => void;
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
    const { u, v } = worldToGridFrac(x, z, worldSize, grids.size);
    const rCells = (options.radius / worldSize) * grids.size;
    const iCenter = Math.round(u);
    const jCenter = Math.round(v);
    const r2 = rCells * rCells;
    const sign = options.lower ? -1 : 1;

    for (let j = 0; j < grids.size; j++) {
      for (let i = 0; i < grids.size; i++) {
        const di = i - iCenter;
        const dj = j - jCenter;
        const d2 = di * di + dj * dj;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / rCells;
        const idx = j * grids.size + i;
        grids.height[idx] = Math.max(
          0,
          Math.min(1, grids.height[idx] + sign * options.strength * falloff * 0.15),
        );
      }
    }
    dirty = true;
  };

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
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
