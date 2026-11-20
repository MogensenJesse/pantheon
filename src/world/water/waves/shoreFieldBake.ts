// src/world/water/waves/shoreFieldBake.ts — distance to the nearest shore and the way to it, baked from the height grid
//
// The swell always travels toward the shore: its phase is the distance to the nearest land (crests run parallel to the
// coast) instead of a distance along a fixed heading. This is the CPU bake of that field; `tsl/waterWavesTsl.ts` reads it
// as a texture and `swellHeightAt` (waveMath.ts) is the plain-number twin. Pure (no three), checked by scripts/checks/water.

/** Texels per side of the field (a cell is world size / (SHORE_FIELD_SIZE - 1): 4 m on the 2048 m map). */
export const SHORE_FIELD_SIZE = 513;

/** Box-blur radius (cells) that rounds the creases where two coasts meet. */
const BLUR_CELLS = 2;
const FAR_M = 1e4;
const INF = 1e9;

export interface ShoreField {
  readonly size: number;
  readonly cellM: number;
  /** RGBA per texel: signed distance (m, positive on the sea, negative on land), the unit-ish gradient toward the shore (x, z), then the lake share (0 open sea, 1 enclosed water). */
  readonly data: Float32Array;
}

export interface ShoreFieldInput {
  /** Normalised heights, `gridSize` x `gridSize` (row = z), metres = value x `heightScale`. */
  heights: Float32Array;
  gridSize: number;
  heightScale: number;
  waterLevelM: number;
  worldSize: number;
}

/** Felzenszwalb's 1-D squared-distance transform, in place over `f` (INF where there is no source). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Distance (in cells) from every texel to the nearest texel where `source` is 1; INF-ish where there is none. */
function distanceToSources(source: Uint8Array, n: number): Float32Array {
  const grid = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) grid[i] = source[i] ? 0 : INF;
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = grid[y * n + x];
    edt1d(f, n, d, v, z);
    for (let y = 0; y < n; y++) grid[y * n + x] = d[y];
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = grid[y * n + x];
    edt1d(f, n, d, v, z);
    for (let x = 0; x < n; x++) grid[y * n + x] = d[x];
  }
  const out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++)
    out[i] = grid[i] >= INF * 0.5 ? Number.POSITIVE_INFINITY : Math.sqrt(grid[i]);
  return out;
}

/** Separable box blur, edges clamped. */
function boxBlur(a: Float32Array, n: number, radius: number): void {
  if (radius <= 0) return;
  const tmp = new Float32Array(n);
  const span = 2 * radius + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += a[y * n + Math.min(n - 1, Math.max(0, x + k))];
        tmp[x] = s / span;
      }
      for (let x = 0; x < n; x++) a[y * n + x] = tmp[x];
    }
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += a[Math.min(n - 1, Math.max(0, y + k)) * n + x];
        tmp[y] = s / span;
      }
      for (let y = 0; y < n; y++) a[y * n + x] = tmp[y];
    }
  }
}

/** Land = any height sample in the texel's footprint at or above the water level (a thin spit still counts). */
function landMask(input: ShoreFieldInput, n: number): { land: Uint8Array; count: number } {
  const { heights, gridSize, heightScale, waterLevelM } = input;
  const step = (gridSize - 1) / (n - 1);
  const half = Math.floor(step / 2);
  const land = new Uint8Array(n * n);
  let count = 0;
  for (let j = 0; j < n; j++) {
    const cj = Math.round(j * step);
    for (let i = 0; i < n; i++) {
      const ci = Math.round(i * step);
      let hit = 0;
      for (let dj = -half; dj <= half && !hit; dj++) {
        const gj = Math.min(gridSize - 1, Math.max(0, cj + dj));
        for (let di = -half; di <= half; di++) {
          const gi = Math.min(gridSize - 1, Math.max(0, ci + di));
          if (heights[gj * gridSize + gi] * heightScale >= waterLevelM) {
            hit = 1;
            break;
          }
        }
      }
      land[j * n + i] = hit;
      count += hit;
    }
  }
  return { land, count };
}

/**
 * 0 on the open sea, 1 in enclosed water (sea-level water the sea cannot reach: lakes, ponds); land takes the value of the
 * nearest water, so the wet sand on a lake shore reads the lake. The sea is the water connected (4-way) to the field's border,
 * so a map with no water on its border counts all of its water as enclosed; a channel narrower than a cell is land to the bake
 * and closes a lake off. Not blurred here.
 */
function lakeShare(land: Uint8Array, n: number): Float32Array {
  const total = n * n;
  const queue = new Int32Array(total);
  const sea = new Uint8Array(total);
  let head = 0;
  let tail = 0;
  const flood = (i: number) => {
    if (!land[i] && !sea[i]) {
      sea[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let k = 0; k < n; k++) {
    flood(k);
    flood((n - 1) * n + k);
    flood(k * n);
    flood(k * n + n - 1);
  }
  const spread = (visit: (i: number, next: number) => void) => {
    while (head < tail) {
      const i = queue[head++];
      const x = i % n;
      const y = (i / n) | 0;
      if (x > 0) visit(i, i - 1);
      if (x < n - 1) visit(i, i + 1);
      if (y > 0) visit(i, i - n);
      if (y < n - 1) visit(i, i + n);
    }
  };
  spread((_, next) => flood(next));

  // every water cell is a seed (sea 0, lake 1); the land takes the value of the water that reaches it first
  const out = new Float32Array(total);
  const known = new Uint8Array(total);
  head = 0;
  tail = 0;
  for (let i = 0; i < total; i++) {
    if (!land[i]) {
      known[i] = 1;
      out[i] = sea[i] ? 0 : 1;
      queue[tail++] = i;
    }
  }
  spread((i, next) => {
    if (!known[next]) {
      known[next] = 1;
      out[next] = out[i];
      queue[tail++] = next;
    }
  });
  return out;
}

/** Writes (and returns) the field. Pass `out` to reuse a buffer of the right size. */
export function bakeShoreField(input: ShoreFieldInput, out?: ShoreField): ShoreField {
  const n = SHORE_FIELD_SIZE;
  const cellM = input.worldSize / (n - 1);
  const data = out && out.data.length === n * n * 4 ? out.data : new Float32Array(n * n * 4);
  const { land, count } = landMask(input, n);

  const signed = new Float32Array(n * n);
  if (count === 0) {
    // an empty sea: far from any shore, waves travel along +x
    signed.fill(FAR_M);
  } else if (count === n * n) {
    signed.fill(-FAR_M);
  } else {
    const sea = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) sea[i] = land[i] ? 0 : 1;
    const toLand = distanceToSources(land, n);
    const toSea = distanceToSources(sea, n);
    // half a cell either side of the boundary, so the field is continuous through the coast line
    for (let i = 0; i < n * n; i++) {
      signed[i] = land[i] ? -(toSea[i] - 0.5) * cellM : (toLand[i] - 0.5) * cellM;
    }
  }
  boxBlur(signed, n, BLUR_CELLS);
  const lake = lakeShare(land, n);
  boxBlur(lake, n, BLUR_CELLS);

  const at = (i: number, j: number) =>
    signed[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4;
      data[o] = signed[j * n + i];
      if (count === 0) {
        data[o + 1] = -1;
        data[o + 2] = 0;
      } else {
        // toward the shore is down the distance
        data[o + 1] = -(at(i + 1, j) - at(i - 1, j)) / (2 * cellM);
        data[o + 2] = -(at(i, j + 1) - at(i, j - 1)) / (2 * cellM);
      }
      data[o + 3] = lake[j * n + i];
    }
  }
  return { size: n, cellM, data };
}

/** Bilinear channel `ch` of the field at world (x, z), clamped to the map. */
function fieldAt(field: ShoreField, worldSize: number, x: number, z: number, ch: number) {
  const half = worldSize * 0.5;
  const cx = Math.min(half, Math.max(-half, x));
  const cz = Math.min(half, Math.max(-half, z));
  const n = field.size;
  const fx = ((cx + half) / worldSize) * (n - 1);
  const fz = ((cz + half) / worldSize) * (n - 1);
  const i0 = Math.min(n - 2, Math.floor(fx));
  const j0 = Math.min(n - 2, Math.floor(fz));
  const tx = fx - i0;
  const tz = fz - j0;
  const d = (i: number, j: number) => field.data[(j * n + i) * 4 + ch];
  const top = d(i0, j0) * (1 - tx) + d(i0 + 1, j0) * tx;
  const bottom = d(i0, j0 + 1) * (1 - tx) + d(i0 + 1, j0 + 1) * tx;
  return { value: top * (1 - tz) + bottom * tz, beyondM: Math.hypot(x - cx, z - cz) };
}

/** Bilinear distance to the shore (m) at world (x, z); beyond the map it keeps growing with the distance to the edge. */
export function shoreDistanceAt(
  field: ShoreField,
  worldSize: number,
  x: number,
  z: number,
): number {
  const s = fieldAt(field, worldSize, x, z, 0);
  return s.value + s.beyondM;
}

/** Bilinear lake share (0 open sea, 1 enclosed water) at world (x, z); beyond the map it is the edge's. */
export function lakeShareAt(field: ShoreField, worldSize: number, x: number, z: number): number {
  return fieldAt(field, worldSize, x, z, 3).value;
}
