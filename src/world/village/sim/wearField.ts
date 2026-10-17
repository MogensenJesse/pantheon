// src/world/village/sim/wearField.ts — footstep wear over the village square (1 m cells, 0..1)
import { VILLAGE } from '../../../config/village.ts';
import { smoothstep01 } from '../../../core/math/scalar.ts';

export interface WearRect {
  iMin: number;
  iMax: number;
  jMin: number;
  jMax: number;
}

/** The worn ground as a save keeps it; the drawn halo is recomputed from it on restore. */
export interface WearState {
  data: Float32Array;
  /** Wear that never fades (laid roads). */
  floor: Float32Array;
  decayClock: number;
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
  /**
   * Wear for drawing: a cell keeps its value across the whole cell and fades out over one cell beyond
   * its edge, so a 1 m cell edge is a ramp instead of a staircase and a one-cell path keeps its width.
   * Read-only; the sim keeps using the nearest-cell `sample`.
   */
  sampleFeathered: (x: number, z: number) => number;
  /**
   * Wear blurred over `WEAR.HALO_CELLS` cells, bilinear: the slowly varying skirt around paths that
   * the terrain layers feather into dirt and short grass. Refreshed for changed tiles in `takeDirty`.
   */
  sampleHalo: (x: number, z: number) => number;
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
  /** A copy of the worn ground. */
  serialize: () => WearState;
  /** Put saved wear back (same field size) and mark every tile changed so the drawn halo is rebuilt. */
  restore: (state: WearState) => void;
  /**
   * Tiles (blocks of TILE_CELLS cells) whose wear changed visibly since the last call. Tiles, not
   * one bounding box, so a few villagers far apart do not dirty the whole village square.
   */
  takeDirty: () => WearRect[];
  /** World rectangle whose drawn wear may differ after a change in the cell rectangle: it reaches the halo's blur. */
  worldRect: (rect: WearRect) => { x0: number; z0: number; x1: number; z1: number };
}

const { WEAR } = VILLAGE;

/** Cells per side of the wear field for a field reaching `halfM` from its centre. */
export function wearFieldSize(halfM: number): number {
  return Math.ceil((2 * halfM) / WEAR.CELL_M);
}

export function createWearField(centerX: number, centerZ: number, halfM: number): WearField {
  const cellM = WEAR.CELL_M;
  const size = wearFieldSize(halfM);
  const originX = centerX - (size * cellM) / 2;
  const originZ = centerZ - (size * cellM) / 2;
  const data = new Float32Array(size * size);
  /** Wear that never fades (laid roads). */
  const floor = new Float32Array(size * size);
  let decayClock = 0;
  const decayFactor = 0.5 ** (WEAR.DECAY_STEP_S / WEAR.HALF_LIFE_S);

  const TILE = WEAR.TILE_CELLS;
  const tilesAcross = Math.ceil(size / TILE);
  const tileDirty = new Uint8Array(tilesAcross * tilesAcross);
  let dirtyTiles: number[] = [];
  const markTile = (ti: number, tj: number) => {
    const tile = tj * tilesAcross + ti;
    if (tileDirty[tile]) return;
    tileDirty[tile] = 1;
    dirtyTiles.push(tile);
  };
  /** Tiles covering the cell rectangle (clamped to the field). */
  const markDirty = (i0: number, i1: number, j0: number, j1: number) => {
    const ti1 = Math.min(tilesAcross - 1, Math.floor(i1 / TILE));
    const tj1 = Math.min(tilesAcross - 1, Math.floor(j1 / TILE));
    for (let tj = Math.max(0, Math.floor(j0 / TILE)); tj <= tj1; tj++) {
      for (let ti = Math.max(0, Math.floor(i0 / TILE)); ti <= ti1; ti++) markTile(ti, tj);
    }
  };
  // Tent blur of the wear (half-width HALO cells), refreshed in takeDirty for the cells it changed.
  const HALO = WEAR.HALO_CELLS;
  const reach = HALO - 1;
  const kernel = Array.from({ length: 2 * reach + 1 }, (_, k) => HALO - Math.abs(k - reach));
  const kernelSum = kernel.reduce((a, b) => a + b, 0);
  const halo = new Float32Array(size * size);
  const haloRows = new Float32Array(size * size);
  const refreshHalo = (r: WearRect) => {
    const i0 = Math.max(0, r.iMin - reach);
    const i1 = Math.min(size - 1, r.iMax + reach);
    const j0 = Math.max(0, r.jMin - reach);
    const j1 = Math.min(size - 1, r.jMax + reach);
    for (let j = Math.max(0, j0 - reach); j <= Math.min(size - 1, j1 + reach); j++) {
      for (let i = i0; i <= i1; i++) {
        let sum = 0;
        for (let o = -reach; o <= reach; o++) {
          const ii = i + o;
          if (ii >= 0 && ii < size) sum += data[j * size + ii]! * kernel[o + reach]!;
        }
        haloRows[j * size + i] = sum / kernelSum;
      }
    }
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        let sum = 0;
        for (let o = -reach; o <= reach; o++) {
          const jj = j + o;
          if (jj >= 0 && jj < size) sum += haloRows[jj * size + i]! * kernel[o + reach]!;
        }
        halo[j * size + i] = sum / kernelSum;
      }
    }
  };
  // Fading only shows while the wear is inside the range the terrain layers map to a value: the core
  // curves, and the halo from where a footpath's blurred wear (about wear / HALO) is a few percent of
  // its full value up to where it is saturated.
  const haloFull = Math.max(WEAR.PATH.HALO_FULL, WEAR.GRASS.HALO_FULL);
  const visibleLo = Math.min(
    WEAR.PATH.LO,
    WEAR.GRASS.LO - WEAR.GRASS.NOISE,
    0.2 * Math.min(WEAR.PATH.HALO_FULL, WEAR.GRASS.HALO_FULL),
  );
  const visibleHi = Math.max(WEAR.PATH.HI, WEAR.GRASS.HI + WEAR.GRASS.NOISE, haloFull * HALO);
  const cellOf = (v: number, origin: number) => Math.floor((v - origin) / cellM);
  const cellValue = (i: number, j: number) =>
    i < 0 || j < 0 || i >= size || j >= size ? 0 : data[j * size + i]!;
  const haloValue = (i: number, j: number) =>
    i < 0 || j < 0 || i >= size || j >= size ? 0 : halo[j * size + i]!;

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
    sampleFeathered: (x, z) => {
      // Each cell holds its value across the whole cell and fades to 0 over one cell beyond its
      // edge; the strongest of the 3x3 neighbours wins, so the result has no seams.
      const fx = (x - originX) / cellM;
      const fz = (z - originZ) / cellM;
      const ci = Math.floor(fx);
      const cj = Math.floor(fz);
      let best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const v = cellValue(ci + di, cj + dj);
          if (v <= best) continue;
          const ex = Math.max(0, Math.abs(fx - (ci + di + 0.5)) - 0.5);
          const ez = Math.max(0, Math.abs(fz - (cj + dj + 0.5)) - 0.5);
          best = Math.max(best, v * (1 - smoothstep01(Math.hypot(ex, ez))));
        }
      }
      return best;
    },
    sampleHalo: (x, z) => {
      // Bilinear between cell centres.
      const fx = (x - originX) / cellM - 0.5;
      const fz = (z - originZ) / cellM - 0.5;
      const i0 = Math.floor(fx);
      const j0 = Math.floor(fz);
      const tx = fx - i0;
      const tz = fz - j0;
      return (
        (haloValue(i0, j0) * (1 - tx) + haloValue(i0 + 1, j0) * tx) * (1 - tz) +
        (haloValue(i0, j0 + 1) * (1 - tx) + haloValue(i0 + 1, j0 + 1) * tx) * tz
      );
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
      for (let j = 0; j < size; j++) {
        const tj = Math.floor(j / TILE);
        for (let i = 0; i < size; i++) {
          const index = j * size + i;
          const v = data[index]!;
          if (v <= 0) continue;
          const faded = v * decayFactor;
          data[index] = faded < 0.002 ? 0 : Math.max(floor[index]!, faded);
          if (v > visibleLo && data[index]! < visibleHi && data[index] !== v) {
            markTile(Math.floor(i / TILE), tj);
          }
        }
      }
    },
    serialize: () => ({ data: data.slice(), floor: floor.slice(), decayClock }),
    restore: (state) => {
      if (state.data.length !== data.length || state.floor.length !== floor.length) {
        throw new Error('saved wear does not match the wear field size');
      }
      data.set(state.data);
      floor.set(state.floor);
      decayClock = state.decayClock;
      for (let tj = 0; tj < tilesAcross; tj++)
        for (let ti = 0; ti < tilesAcross; ti++) markTile(ti, tj);
    },
    takeDirty: () => {
      const rects = dirtyTiles.map((tile) => {
        const ti = tile % tilesAcross;
        const tj = (tile - ti) / tilesAcross;
        return {
          iMin: ti * TILE,
          iMax: Math.min(size - 1, ti * TILE + TILE - 1),
          jMin: tj * TILE,
          jMax: Math.min(size - 1, tj * TILE + TILE - 1),
        };
      });
      for (const tile of dirtyTiles) tileDirty[tile] = 0;
      dirtyTiles = [];
      for (const rect of rects) refreshHalo(rect);
      return rects;
    },
    worldRect: (r) => ({
      x0: originX + (r.iMin - reach) * cellM,
      z0: originZ + (r.jMin - reach) * cellM,
      x1: originX + (r.iMax + 1 + reach) * cellM,
      z1: originZ + (r.jMax + 1 + reach) * cellM,
    }),
  };
}
