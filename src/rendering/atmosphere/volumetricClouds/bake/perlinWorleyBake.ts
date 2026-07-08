// src/rendering/atmosphere/volumetricClouds/bake/perlinWorleyBake.ts
// CPU port of Simon Dev Shaders_Clouds1 generator-shader.glsl (tileable Perlin-Worley 3D atlas).

/** Matches Simon Dev CloudGeneratorAtlas: 32² slices × 64 depth, zLevel = slice / 4. */
export const CLOUD_PERLIN_WORLEY_SIZE = {
  width: 32,
  height: 32,
  depth: 64,
} as const;

export const CLOUD_PERLIN_WORLEY_NUM_CELLS = 2;

type Vec3 = [number, number, number];

function fract(x: number): number {
  return x - Math.floor(x);
}

function saturate(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function remap(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = saturate((v - inMin) / (inMax - inMin));
  return outMin + (outMax - outMin) * t;
}

function smootherstep(edge0: number, edge1: number, x: number): number {
  x = saturate((x - edge0) / (edge1 - edge0));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function modComp(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function hash3(p: Vec3): Vec3 {
  const d0 = p[0] * 127.1 + p[1] * 311.7 + p[2] * 74.7;
  const d1 = p[0] * 269.5 + p[1] * 183.3 + p[2] * 246.1;
  const d2 = p[0] * 113.5 + p[1] * 271.9 + p[2] * 124.6;
  return [
    -1 + 2 * fract(Math.sin(d0) * 43758.5453123),
    -1 + 2 * fract(Math.sin(d1) * 43758.5453123),
    -1 + 2 * fract(Math.sin(d2) * 43758.5453123),
  ];
}

function hash3New(p: Vec3, tileLength: number): Vec3 {
  const q: Vec3 = [modComp(p[0], tileLength), modComp(p[1], tileLength), modComp(p[2], tileLength)];
  const d0 = q[0] * 127.1 + q[1] * 311.7 + q[2] * 74.7;
  const d1 = q[0] * 269.5 + q[1] * 183.3 + q[2] * 246.1;
  const d2 = q[0] * 113.5 + q[1] * 271.9 + q[2] * 124.6;
  return [
    -1 + 2 * fract(Math.sin(d0) * 43758.5453123),
    -1 + 2 * fract(Math.sin(d1) * 43758.5453123),
    -1 + 2 * fract(Math.sin(d2) * 43758.5453123),
  ];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function voronoiSlow(
  u: number,
  v: number,
  zLevel: number,
  maxOffset: number,
  cellsMult: number,
  seed: number,
): number {
  const coords: Vec3 = [u * cellsMult, v * cellsMult, zLevel];
  const seedHash = hash3([seed, seed * seed * Math.PI, seed * 1.17421]);
  const gridBase: Vec3 = [Math.floor(coords[0]), Math.floor(coords[1]), Math.floor(coords[2])];
  const gridOffset: Vec3 = [fract(coords[0]), fract(coords[1]), fract(coords[2])];
  const maxCellSearch = Math.ceil(maxOffset) + 1;

  let closest = 1;
  for (let y = -maxCellSearch; y <= maxCellSearch; y += 1) {
    for (let x = -maxCellSearch; x <= maxCellSearch; x += 1) {
      for (let z = -maxCellSearch; z <= maxCellSearch; z += 1) {
        const neighbour: Vec3 = [x, y, z];
        const cellWorld: Vec3 = [
          gridBase[0] + neighbour[0],
          gridBase[1] + neighbour[1],
          gridBase[2] + neighbour[2],
        ];
        cellWorld[0] = modComp(cellWorld[0], cellsMult);
        cellWorld[1] = modComp(cellWorld[1], cellsMult);

        const cellOffset = hash3(add3(cellWorld, seedHash));
        const offset: Vec3 = [
          cellOffset[0] * maxOffset,
          cellOffset[1] * maxOffset,
          cellOffset[2] * maxOffset,
        ];
        const delta: Vec3 = [
          neighbour[0] + offset[0] - gridOffset[0],
          neighbour[1] + offset[1] - gridOffset[1],
          neighbour[2] + offset[2] - gridOffset[2],
        ];
        const dist = Math.sqrt(delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2);
        closest = Math.min(closest, dist);
      }
    }
  }
  return saturate(closest);
}

function gradientNoise(p: Vec3, tileLength: number): number {
  const i: Vec3 = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
  const f: Vec3 = [fract(p[0]), fract(p[1]), fract(p[2])];
  const u: Vec3 = [smootherstep(0, 1, f[0]), smootherstep(0, 1, f[1]), smootherstep(0, 1, f[2])];

  const c000 = dot3(hash3New(add3(i, [0, 0, 0]), tileLength), sub3(f, [0, 0, 0]));
  const c100 = dot3(hash3New(add3(i, [1, 0, 0]), tileLength), sub3(f, [1, 0, 0]));
  const c010 = dot3(hash3New(add3(i, [0, 1, 0]), tileLength), sub3(f, [0, 1, 0]));
  const c110 = dot3(hash3New(add3(i, [1, 1, 0]), tileLength), sub3(f, [1, 1, 0]));
  const c001 = dot3(hash3New(add3(i, [0, 0, 1]), tileLength), sub3(f, [0, 0, 1]));
  const c101 = dot3(hash3New(add3(i, [1, 0, 1]), tileLength), sub3(f, [1, 0, 1]));
  const c011 = dot3(hash3New(add3(i, [0, 1, 1]), tileLength), sub3(f, [0, 1, 1]));
  const c111 = dot3(hash3New(add3(i, [1, 1, 1]), tileLength), sub3(f, [1, 1, 1]));

  const x00 = c000 + (c100 - c000) * u[0];
  const x10 = c010 + (c110 - c010) * u[0];
  const x01 = c001 + (c101 - c001) * u[0];
  const x11 = c011 + (c111 - c011) * u[0];
  const y0 = x00 + (x10 - x00) * u[1];
  const y1 = x01 + (x11 - x01) * u[1];
  return y0 + (y1 - y0) * u[2];
}

function tileableFbm(p: Vec3, tileLength: number): number {
  const persistence = 0.5;
  const lacunarity = 2;
  const octaves = 8;
  let amplitude = 0.5;
  let total = 0;
  let normalization = 0;
  let pos: Vec3 = [p[0], p[1], p[2]];

  for (let i = 0; i < octaves; i += 1) {
    const noiseValue = gradientNoise(pos, tileLength * lacunarity * 0.5) * 0.5 + 0.5;
    total += noiseValue * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
    pos = [pos[0] * lacunarity, pos[1] * lacunarity, pos[2] * lacunarity];
  }

  total /= normalization;
  return smootherstep(0, 1, total);
}

function perlinWorleyDetails(
  u: number,
  v: number,
  zLevel: number,
  cellRange: number,
  numCells: number,
  mult: number,
): [number, number, number, number] {
  let perlinWorley = 0;
  {
    const worley0 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 2 * mult, 1);
    const worley1 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 8 * mult, 2);
    const worley2 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 16 * mult, 3);
    const worleyFbm = worley0 * 0.625 + worley1 * 0.25 + worley2 * 0.125;

    const tileLength = 8;
    const fbm0 = tileableFbm(
      [u * tileLength * mult, v * tileLength * mult, zLevel * mult],
      tileLength,
    );
    perlinWorley = remap(fbm0, 0, 1, worleyFbm, 1);
  }

  const worley1 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 2 * mult, 5);
  const worley2 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 4 * mult, 6);
  const worley3 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 8 * mult, 7);
  const worley4 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 16 * mult, 8);
  const worley5 = 1 - voronoiSlow(u, v, zLevel, cellRange, numCells * 32 * mult, 9);

  const worleyFbm0 = worley1 * 0.625 + worley2 * 0.25 + worley3 * 0.125;
  const worleyFbm1 = worley2 * 0.625 + worley3 * 0.25 + worley4 * 0.125;
  const worleyFbm2 = worley3 * 0.625 + worley4 * 0.25 + worley5 * 0.125;
  const lowFreqFbm = worleyFbm0 * 0.625 + worleyFbm1 * 0.25 + worleyFbm2 * 0.125;

  const perlinWorleyDetail = remap(perlinWorley, lowFreqFbm, 1, 0, 1);
  return [perlinWorley, perlinWorleyDetail, 0, 0];
}

/** Bake RGBA8 volume matching Simon Dev atlas layout (32×32×64). */
export function bakePerlinWorleyVolume(
  size = CLOUD_PERLIN_WORLEY_SIZE,
  numCells = CLOUD_PERLIN_WORLEY_NUM_CELLS,
): Uint8Array {
  const { width, height, depth } = size;
  const data = new Uint8Array(width * height * depth * 4);
  const cellRange = 1;

  for (let z = 0; z < depth; z += 1) {
    const zLevel = z / 4;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const u = (x + 0.5) / width;
        const v = (y + 0.5) / height;
        const rgba = perlinWorleyDetails(u, v, zLevel, cellRange, numCells, 1);
        const i = (z * width * height + y * width + x) * 4;
        for (let c = 0; c < 4; c += 1) {
          data[i + c] = Math.round(saturate(rgba[c]!) * 255);
        }
      }
    }
  }
  return data;
}

export const CLOUD_PERLIN_WORLEY_BIN_MAGIC = 0x31305750; // 'PW01' little-endian

export interface CloudPerlinWorleyBin {
  width: number;
  height: number;
  depth: number;
  data: Uint8Array;
}

export function encodePerlinWorleyBin(
  data: Uint8Array,
  size = CLOUD_PERLIN_WORLEY_SIZE,
): Uint8Array {
  const header = new ArrayBuffer(16);
  const view = new DataView(header);
  view.setUint32(0, CLOUD_PERLIN_WORLEY_BIN_MAGIC, true);
  view.setUint16(4, size.width, true);
  view.setUint16(6, size.height, true);
  view.setUint16(8, size.depth, true);
  view.setUint16(10, 0, true);
  const out = new Uint8Array(16 + data.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(data, 16);
  return out;
}

export function decodePerlinWorleyBin(buffer: ArrayBuffer): CloudPerlinWorleyBin {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== CLOUD_PERLIN_WORLEY_BIN_MAGIC) {
    throw new Error('Invalid cloud Perlin-Worley bin magic');
  }
  const width = view.getUint16(4, true);
  const height = view.getUint16(6, true);
  const depth = view.getUint16(8, true);
  const expected = width * height * depth * 4;
  const data = new Uint8Array(buffer, 16, expected);
  if (data.byteLength !== expected) {
    throw new Error(`Cloud Perlin-Worley bin size mismatch (expected ${expected} bytes)`);
  }
  return { width, height, depth, data: new Uint8Array(data) };
}
