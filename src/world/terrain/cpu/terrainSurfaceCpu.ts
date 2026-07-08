// src/world/terrain/cpu/terrainSurfaceCpu.ts — CPU macro + detail displacement surface sampling for props
import type { DataTexture, Texture, Vector3 } from 'three';
import { Vector3 as Vector3Impl } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { sampleHeightBilinear } from '../../../map/MapGrids';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { WORLD } from '../../WorldConfig';
import {
  TERRAIN_ATLAS_BIOME_INDEX,
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_DISP_TILE_PX,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_ROWS,
} from '../atlas/atlasConstants';
import { biomeSplatThresholds } from '../material/biomeSplatUniforms';

const INV_ATLAS_COLS = 1 / TERRAIN_ATLAS_COLS;
const INV_ATLAS_ROWS = 1 / TERRAIN_ATLAS_ROWS;
const DISP_SLOT_CELL = TERRAIN_ATLAS_DISP_TILE_PX + TERRAIN_ATLAS_GUTTER_PX * 2;
const DISP_SLOT_INNER = TERRAIN_ATLAS_DISP_TILE_PX / DISP_SLOT_CELL;
const DISP_SLOT_GUTTER = TERRAIN_ATLAS_GUTTER_PX / DISP_SLOT_CELL;

export interface PropTerrainSurface {
  sampleSurfaceY: (x: number, z: number) => number;
  sampleSurfaceNormal: (x: number, z: number, target?: Vector3) => Vector3;
}

interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface TerrainSurfaceCpuState {
  ctx: Pick<
    MapTerrainContext,
    'getWorldY' | 'getHeightAt' | 'grids' | 'biomeMap' | 'pathMap' | 'detailDisplacementMap'
  >;
  worldSize: number;
  heightScale: number;
  heightNormalStep: number;
  displacementEnabled: boolean;
  biomes: typeof VISUAL.terrain.biomes;
  snow: typeof VISUAL.terrain.snow;
  thresholds: ReturnType<typeof biomeSplatThresholds>;
  useBiomeMap: number;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

export function worldToTerrainMapUv(
  x: number,
  z: number,
  worldSize: number,
): { u: number; v: number } {
  return { u: x / worldSize + 0.5, v: z / worldSize + 0.5 };
}

function sampleR8Bilinear(
  data: Uint8Array,
  width: number,
  height: number,
  u: number,
  v: number,
): number {
  const clampedU = Math.max(0, Math.min(1, u));
  const clampedV = Math.max(0, Math.min(1, v));
  const px = clampedU * (width - 1);
  const py = clampedV * (height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  const v00 = data[y0 * width + x0]! / 255;
  const v10 = data[y0 * width + x1]! / 255;
  const v01 = data[y1 * width + x0]! / 255;
  const v11 = data[y1 * width + x1]! / 255;
  const v0 = v00 * (1 - tx) + v10 * tx;
  const v1 = v01 * (1 - tx) + v11 * tx;
  return v0 * (1 - ty) + v1 * ty;
}

function sampleRgbaBilinear(
  data: Uint8Array,
  width: number,
  height: number,
  u: number,
  v: number,
): Vec4 {
  const clampedU = Math.max(0, Math.min(1, u));
  const clampedV = Math.max(0, Math.min(1, v));
  const px = clampedU * (width - 1);
  const py = clampedV * (height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;

  const sample = (ix: number, iy: number): Vec4 => {
    const o = (iy * width + ix) * 4;
    return {
      x: data[o]! / 255,
      y: data[o + 1]! / 255,
      z: data[o + 2]! / 255,
      w: data[o + 3]! / 255,
    };
  };

  const c00 = sample(x0, y0);
  const c10 = sample(x1, y0);
  const c01 = sample(x0, y1);
  const c11 = sample(x1, y1);

  const lerp4 = (a: Vec4, b: Vec4, t: number): Vec4 => ({
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    z: mix(a.z, b.z, t),
    w: mix(a.w, b.w, t),
  });

  const v0 = lerp4(c00, c10, tx);
  const v1 = lerp4(c01, c11, tx);
  return lerp4(v0, v1, ty);
}

function atlasTileUvDisp(
  tileU: number,
  tileV: number,
  slotIndex: number,
): { u: number; v: number } {
  const col = slotIndex % TERRAIN_ATLAS_COLS;
  const row = Math.floor(slotIndex / TERRAIN_ATLAS_COLS);
  const fu = fract(tileU) * DISP_SLOT_INNER + DISP_SLOT_GUTTER;
  const fv = fract(tileV) * DISP_SLOT_INNER + DISP_SLOT_GUTTER;
  return {
    u: fu * INV_ATLAS_COLS + col * INV_ATLAS_COLS,
    v: fv * INV_ATLAS_ROWS + row * INV_ATLAS_ROWS,
  };
}

function sampleDispAtlasR8(
  atlas: Texture,
  worldX: number,
  worldZ: number,
  repeat: number,
  slotIndex: number,
): number {
  const image = atlas.image as { data?: Uint8Array; width: number; height: number };
  if (!image?.data) return 0;
  const tileU = worldX * repeat;
  const tileV = worldZ * repeat;
  const { u, v } = atlasTileUvDisp(tileU, tileV, slotIndex);
  return sampleR8Bilinear(image.data, image.width, image.height, u, v);
}

function computeBiomeHeightWeights(
  heightNorm: number,
  thresholds: ReturnType<typeof biomeSplatThresholds>,
): Vec4 {
  const { waterMax, shoreMax, forestMax, hillsMax, blendWidth } = thresholds;
  const wShore =
    smoothstep(waterMax, waterMax + blendWidth, heightNorm) *
    (1 - smoothstep(shoreMax - blendWidth, shoreMax, heightNorm));
  const wForest =
    smoothstep(shoreMax - blendWidth, shoreMax, heightNorm) *
    (1 - smoothstep(forestMax - blendWidth, forestMax, heightNorm));
  const wHills =
    smoothstep(forestMax - blendWidth, forestMax, heightNorm) *
    (1 - smoothstep(hillsMax - blendWidth, hillsMax, heightNorm));
  const wRockH = smoothstep(hillsMax - blendWidth, hillsMax, heightNorm);
  const sum = wShore + wForest + wHills + wRockH + 0.0001;
  return { x: wShore / sum, y: wForest / sum, z: wHills / sum, w: wRockH / sum };
}

function resolvePaintedHwUsed(
  heightNorm: number,
  painted: Vec4,
  thresholds: ReturnType<typeof biomeSplatThresholds>,
  useBiomeMap: number,
): Vec4 {
  const heightWeights = computeBiomeHeightWeights(heightNorm, thresholds);
  const hw: Vec4 = {
    x: mix(heightWeights.x, painted.x, useBiomeMap),
    y: mix(heightWeights.y, painted.y, useBiomeMap),
    z: mix(heightWeights.z, painted.z, useBiomeMap),
    w: mix(heightWeights.w, painted.w, useBiomeMap),
  };
  const hwSum = hw.x + hw.y + hw.z + hw.w;
  if (hwSum > 0.001) return hw;
  return heightWeights;
}

function computeSnowWeight(
  heightNorm: number,
  hwUsed: Vec4,
  snow: typeof VISUAL.terrain.snow,
): number {
  const snowStartPad = snow.mountainWeight * 0.12;
  const snowEndPad = snow.mountainWeight * 0.08;
  const heightSnow = smoothstep(
    snow.heightStart - snowStartPad,
    snow.heightEnd - snowEndPad,
    heightNorm,
  );
  return heightSnow * mix(1, hwUsed.w, snow.mountainWeight);
}

function samplePaintedBiomeWeights(state: TerrainSurfaceCpuState, x: number, z: number): Vec4 {
  const { u, v } = worldToTerrainMapUv(x, z, state.worldSize);
  const tex = state.ctx.biomeMap as DataTexture;
  const data = tex.image.data as Uint8Array;
  return sampleRgbaBilinear(data, tex.image.width, tex.image.height, u, v);
}

function samplePathWeight(state: TerrainSurfaceCpuState, x: number, z: number): number {
  const { u, v } = worldToTerrainMapUv(x, z, state.worldSize);
  const tex = state.ctx.pathMap as DataTexture;
  const data = tex.image.data as Uint8Array;
  return sampleR8Bilinear(data, tex.image.width, tex.image.height, u, v) * state.useBiomeMap;
}

function mixBiomeDisplacementCpu(state: TerrainSurfaceCpuState, x: number, z: number): number {
  const atlas = state.ctx.detailDisplacementMap;
  if (!atlas) return 0;

  const heightNorm = sampleHeightBilinear(state.ctx.grids, x, z, WORLD.SIZE);
  const painted = samplePaintedBiomeWeights(state, x, z);
  const hwUsed = resolvePaintedHwUsed(heightNorm, painted, state.thresholds, state.useBiomeMap);
  const snowW = computeSnowWeight(heightNorm, hwUsed, state.snow);
  const pathW = samplePathWeight(state, x, z);

  const biomes = state.biomes;
  const shoreDisp = sampleDispAtlasR8(
    atlas,
    x,
    z,
    biomes.shore.tileRepeat,
    TERRAIN_ATLAS_BIOME_INDEX.shore,
  );
  const forestDisp = sampleDispAtlasR8(
    atlas,
    x,
    z,
    biomes.forest.tileRepeat,
    TERRAIN_ATLAS_BIOME_INDEX.forest,
  );
  const hillsDisp = sampleDispAtlasR8(
    atlas,
    x,
    z,
    biomes.hills.tileRepeat,
    TERRAIN_ATLAS_BIOME_INDEX.hills,
  );
  const mountainDisp = sampleDispAtlasR8(
    atlas,
    x,
    z,
    biomes.mountain.tileRepeat,
    TERRAIN_ATLAS_BIOME_INDEX.mountain,
  );

  const landOff =
    shoreDisp * biomes.shore.detailDisplacement * hwUsed.x +
    forestDisp * biomes.forest.detailDisplacement * hwUsed.y +
    hillsDisp * biomes.hills.detailDisplacement * hwUsed.z +
    mountainDisp * biomes.mountain.detailDisplacement * hwUsed.w;

  const snowDisp = sampleDispAtlasR8(
    atlas,
    x,
    z,
    biomes.snow.tileRepeat,
    TERRAIN_ATLAS_BIOME_INDEX.snow,
  );
  const snowOff = snowDisp * biomes.snow.detailDisplacement;
  const withSnowOff = mix(landOff, snowOff, snowW);

  const pathDisp = sampleDispAtlasR8(
    atlas,
    x,
    z,
    biomes.path.tileRepeat,
    TERRAIN_ATLAS_BIOME_INDEX.path,
  );
  const pathOff = (pathDisp >= 0.5 ? 1 : 0) * biomes.path.detailDisplacement;
  return mix(withSnowOff, pathOff, pathW);
}

function sampleMacroNormalCpu(
  state: TerrainSurfaceCpuState,
  x: number,
  z: number,
  target: Vector3,
): Vector3 {
  const step = state.heightNormalStep;
  const twoStep = step * 2;
  const hL = state.ctx.getHeightAt(x - step, z);
  const hR = state.ctx.getHeightAt(x + step, z);
  const hD = state.ctx.getHeightAt(x, z - step);
  const hU = state.ctx.getHeightAt(x, z + step);
  const dx = ((hR - hL) * state.heightScale) / twoStep;
  const dz = ((hU - hD) * state.heightScale) / twoStep;
  const nx = -dx;
  const ny = 1;
  const nz = -dz;
  const len = Math.hypot(nx, ny, nz) || 1;
  const rawX = nx / len;
  const rawY = ny / len;
  const rawZ = nz / len;
  const flatBlend = smoothstep(0.92, 0.99, rawY);
  const mixX = mix(rawX, 0, flatBlend);
  const mixY = mix(rawY, 1, flatBlend);
  const mixZ = mix(rawZ, 0, flatBlend);
  const mixLen = Math.hypot(mixX, mixY, mixZ) || 1;
  return target.set(mixX / mixLen, mixY / mixLen, mixZ / mixLen);
}

function sampleTerrainSurfaceYCpu(state: TerrainSurfaceCpuState, x: number, z: number): number {
  const macroY = state.ctx.getWorldY(x, z);
  if (!state.displacementEnabled || !state.ctx.detailDisplacementMap) {
    return macroY;
  }

  const normal = sampleMacroNormalCpu(state, x, z, _normalScratch);
  const disp = mixBiomeDisplacementCpu(state, x, z);
  return macroY + normal.y * disp;
}

function sampleTerrainSurfaceNormalCpu(
  state: TerrainSurfaceCpuState,
  x: number,
  z: number,
  target: Vector3,
): Vector3 {
  const step = state.heightNormalStep;
  const hL = sampleTerrainSurfaceYCpu(state, x - step, z);
  const hR = sampleTerrainSurfaceYCpu(state, x + step, z);
  const hD = sampleTerrainSurfaceYCpu(state, x, z - step);
  const hU = sampleTerrainSurfaceYCpu(state, x, z + step);
  const dhdx = (hR - hL) / (2 * step);
  const dhdz = (hU - hD) / (2 * step);
  const nx = -dhdx;
  const ny = 1;
  const nz = -dhdz;
  const len = Math.hypot(nx, ny, nz) || 1;
  return target.set(nx / len, ny / len, nz / len);
}

const _normalScratch = new Vector3Impl();

function createTerrainSurfaceCpuState(ctx: MapTerrainContext): TerrainSurfaceCpuState {
  return {
    ctx,
    worldSize: WORLD.SIZE,
    heightScale: WORLD.HEIGHT_SCALE,
    heightNormalStep: WORLD.SIZE / Math.max(1, VISUAL.terrain.meshSegments),
    displacementEnabled: VISUAL.terrain.displacementEnabled,
    biomes: VISUAL.terrain.biomes,
    snow: VISUAL.terrain.snow,
    thresholds: biomeSplatThresholds(),
    useBiomeMap: 1,
  };
}

/** Build a prop placement surface sampler — full detail disp at world XZ (no player clipmap fade). */
export function createPropTerrainSurface(ctx: MapTerrainContext): PropTerrainSurface {
  const state = createTerrainSurfaceCpuState(ctx);
  return {
    sampleSurfaceY: (x, z) => sampleTerrainSurfaceYCpu(state, x, z),
    sampleSurfaceNormal: (x, z, target = new Vector3Impl()) =>
      sampleTerrainSurfaceNormalCpu(state, x, z, target),
  };
}

/** Direct CPU surface Y — shared by editor when displacement maps are available. */
export function samplePropTerrainSurfaceY(ctx: MapTerrainContext, x: number, z: number): number {
  return sampleTerrainSurfaceYCpu(createTerrainSurfaceCpuState(ctx), x, z);
}

/** Direct CPU surface normal — shared by editor when displacement maps are available. */
export function samplePropTerrainSurfaceNormal(
  ctx: MapTerrainContext,
  x: number,
  z: number,
  target = new Vector3Impl(),
): Vector3 {
  return sampleTerrainSurfaceNormalCpu(createTerrainSurfaceCpuState(ctx), x, z, target);
}
