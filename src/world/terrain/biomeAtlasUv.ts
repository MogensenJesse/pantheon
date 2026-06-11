// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeAtlasUv.ts — tile UV helper for 3×3 terrain map atlases
import {
  Fn,
  dFdx,
  dFdy,
  float,
  fract,
  max,
  mix,
  modelWorldMatrix,
  positionGeometry,
  step,
  vec2,
  vec4,
} from 'three/tsl';
import { TERRAIN_ATLAS_BIOME_INDEX, TERRAIN_ATLAS_COLS } from './terrainMapAtlas';

const invCols = float(1 / TERRAIN_ATLAS_COLS);
const invRows = float(1 / TERRAIN_ATLAS_COLS);

/** Map world XZ + atlas slot index (0–6) to atlas sample coordinates. */
export const atlasTileUv = Fn(([uv, index]) => {
  const cols = float(TERRAIN_ATLAS_COLS);
  const col = index.mod(cols);
  const row = index.div(cols).floor();
  return vec2(
    fract(uv.x).mul(invCols).add(col.mul(invCols)),
    fract(uv.y).mul(invRows).add(row.mul(invRows)),
  );
});

/** Undisplaced macro mesh XZ in world space — use for splat/disp UVs (not displaced positionWorld). */
export const macroSurfaceWorldXZ = Fn(() => {
  const worldPos = modelWorldMatrix.mul(vec4(positionGeometry, float(1))).xyz;
  return vec2(worldPos.x, worldPos.z);
});

/** World XZ scaled by per-biome tile repeat — use before atlasTileUv. */
export const biomeSurfaceUv = Fn(([worldXZ, repeat]) => worldXZ.mul(repeat));

/** Vertex-stage tiled atlas sample (no dFdx/dFdy — displacement atlas uses LinearFilter, no mips). */
export const sampleTiledAtlasVert = Fn(([tex, worldXZ, repeat, index]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  return tex.sample(atlasTileUv(tileUv, index));
});

/**
 * Fragment-stage mip-safe tiled atlas sample.
 * Sample UV uses fract(tileUv) but mip LOD uses derivatives of continuous tileUv so repeat
 * boundaries do not spike dFdx/dFdy (the usual cause of visible tile grid lines).
 */
export const sampleTiledAtlas = Fn(([tex, worldXZ, repeat, index]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  const atlasUv = atlasTileUv(tileUv, index);
  const gradX = vec2(dFdx(tileUv.x).mul(invCols), dFdx(tileUv.y).mul(invRows));
  const gradY = vec2(dFdy(tileUv.x).mul(invCols), dFdy(tileUv.y).mul(invRows));
  return tex.sample(atlasUv).grad(gradX, gradY);
});

/** UV into painted biome / path / meadow weight maps (use undisplaced world XZ). */
export const terrainMapUv = Fn(([worldSize, worldXZ]) => worldXZ.div(worldSize).add(0.5));

/** Pick one of four land-biome scalars by dominant splat weight (shore…mountain in w). */
export const selectDominantLandScalar = Fn(([shore, forest, hills, mountain, w]) => {
  const m01 = max(w.x, w.y);
  const v01 = mix(forest, shore, step(w.y, w.x));
  const m23 = max(w.z, w.w);
  const v23 = mix(mountain, hills, step(w.w, w.z));
  return mix(v23, v01, step(m23, m01));
});

/** Atlas slot index for the dominant land biome (single vertex displacement fetch). */
export const selectDominantLandAtlasIndex = Fn(([w]) => {
  return selectDominantLandScalar(
    float(TERRAIN_ATLAS_BIOME_INDEX.shore),
    float(TERRAIN_ATLAS_BIOME_INDEX.forest),
    float(TERRAIN_ATLAS_BIOME_INDEX.hills),
    float(TERRAIN_ATLAS_BIOME_INDEX.mountain),
    w,
  );
});

/** Pick displacement offset from the single land biome with highest splat weight. */
export const selectDominantDisplacement = Fn(([shore, forest, hills, mountain, w]) => {
  return selectDominantLandScalar(shore, forest, hills, mountain, w);
});
