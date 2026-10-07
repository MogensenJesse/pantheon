// src/world/village/sim/wearField.ts — footstep wear over the village square (1 m cells, 0..1)
import { VILLAGE } from '../../../config/village.ts';

export interface WearRect {
  iMin: number;
  iMax: number;
  jMin: number;
  jMax: number;
}

export interface WearField {
  readonly cellM: number;
  /** Cells per side. */
  readonly size: number;
  readonly originX: number;
  readonly originZ: number;
  readonly data: Float32Array;
  /** Wear at a world position (0 outside the field). */
  sample: (x: number, z: number) => number;
  /** A villager moved `distance` m ending at (x, z). */
  walk: (x: number, z: number, distance: number) => void;
  /** Paint wear `value` along a segment (max-blend), e.g. the founding road. */
  paintLine: (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    value: number,
    radiusM: number,
    floor?: number,
  ) => void;
  /** Fade unused wear; call with elapsed village seconds, it batches itself. */
  decay: (dt: number) => void;
  /** Cells changed since the last call, or null. */
  takeDirty: () => WearRect | null;
  /** World rectangle of a cell rectangle. */
  worldRect: (rect: WearRect) => { x0: number; z0: number; x1: number; z1: number };
}

const { WEAR } = VILLAGE;

export function createWearField(centerX: number, centerZ: number, halfM: number): WearField {
  const cellM = WEAR.CELL_M;
  const size = Math.ceil((2 * halfM) / cellM);
  const originX = centerX - (size * cellM) / 2;
  const originZ = centerZ - (size * cellM) / 2;
  const data = new Float32Array(size * size);
  /** Wear that never fades (laid roads). */
  const floor = new Float32Array(size * size);
  let dirty: WearRect | null = null;
  let decayClock = 0;
  const decayFactor = 0.5 ** (WEAR.DECAY_STEP_S / WEAR.HALF_LIFE_S);

  const markDirty = (i0: number, i1: number, j0: number, j1: number) => {
    dirty = dirty
      ? {
          iMin: Math.min(dirty.iMin, i0),
          iMax: Math.max(dirty.iMax, i1),
          jMin: Math.min(dirty.jMin, j0),
          jMax: Math.max(dirty.jMax, j1),
        }
      : { iMin: i0, iMax: i1, jMin: j0, jMax: j1 };
  };
  const cellOf = (v: number, origin: number) => Math.floor((v - origin) / cellM);

  return {
    cellM,
    size,
    originX,
    originZ,
    data,
    sample: (x, z) => {
      const i = cellOf(x, originX);
      const j = cellOf(z, originZ);
      return i < 0 || j < 0 || i >= size || j >= size ? 0 : data[j * size + i]!;
    },
    walk: (x, z, distance) => {
      const ci = cellOf(x, originX);
      const cj = cellOf(z, originZ);
      if (ci < 1 || cj < 1 || ci >= size - 1 || cj >= size - 1) return;
      const amount = distance * WEAR.DEPOSIT_PER_M;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const index = (cj + dj) * size + (ci + di);
          const share = di === 0 && dj === 0 ? 1 : WEAR.NEIGHBOR_SHARE;
          data[index] = Math.min(1, data[index]! + amount * share);
        }
      }
      markDirty(ci - 1, ci + 1, cj - 1, cj + 1);
    },
    paintLine: (x0, z0, x1, z1, value, radiusM, floorValue = 0) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (cellM * 0.5)));
      const r = Math.max(1, Math.ceil(radiusM / cellM));
      for (let k = 0; k <= steps; k++) {
        const x = x0 + ((x1 - x0) * k) / steps;
        const z = z0 + ((z1 - z0) * k) / steps;
        const ci = cellOf(x, originX);
        const cj = cellOf(z, originZ);
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            const i = ci + di;
            const j = cj + dj;
            if (i < 0 || j < 0 || i >= size || j >= size) continue;
            if (Math.hypot(di, dj) * cellM > radiusM) continue;
            data[j * size + i] = Math.max(data[j * size + i]!, value);
            floor[j * size + i] = Math.max(floor[j * size + i]!, floorValue);
          }
        }
        markDirty(
          Math.max(0, ci - r),
          Math.min(size - 1, ci + r),
          Math.max(0, cj - r),
          Math.min(size - 1, cj + r),
        );
      }
    },
    decay: (dt) => {
      decayClock += dt;
      if (decayClock < WEAR.DECAY_STEP_S) return;
      decayClock -= WEAR.DECAY_STEP_S;
      let any = false;
      for (let i = 0; i < data.length; i++) {
        const v = data[i]!;
        if (v <= 0) continue;
        any = true;
        const faded = v * decayFactor;
        data[i] = faded < 0.002 ? 0 : Math.max(floor[i]!, faded);
      }
      if (any) markDirty(0, size - 1, 0, size - 1);
    },
    takeDirty: () => {
      const d = dirty;
      dirty = null;
      return d;
    },
    worldRect: (r) => ({
      x0: originX + r.iMin * cellM,
      z0: originZ + r.jMin * cellM,
      x1: originX + (r.iMax + 1) * cellM,
      z1: originZ + (r.jMax + 1) * cellM,
    }),
  };
}
