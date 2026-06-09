// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeAtlasUv.ts — tile UV helper for 3×3 terrain map atlases
import { Fn, dFdx, dFdy, float, fract, max, mix, positionWorld, step, vec2 } from 'three/tsl';
import { TERRAIN_ATLAS_COLS } from './terrainMapAtlas';

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

/** UV into painted biome / path / meadow weight maps. */
export const terrainMapUv = Fn(([worldSize]) => {
  return vec2(positionWorld.x, positionWorld.z).div(worldSize).add(0.5);
});

/** Pick displacement from the single land biome with highest splat weight (no weighted average). */
export const selectDominantDisplacement = Fn(([shore, forest, hills, mountain, w]) => {
  const m01 = max(w.x, w.y);
  const d01 = mix(forest, shore, step(w.y, w.x));
  const m23 = max(w.z, w.w);
  const d23 = mix(mountain, hills, step(w.w, w.z));
  return mix(d23, d01, step(m23, m01));
});
