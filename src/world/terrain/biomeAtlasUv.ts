// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeAtlasUv.ts — tile UV helper for 3×3 terrain map atlases
import {
  Fn,
  dFdx,
  dFdy,
  float,
  fract,
  modelWorldMatrix,
  positionGeometry,
  vec2,
  vec4,
} from 'three/tsl';
import {
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_DISP_TILE_PX,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_SURF_TILE_PX,
} from './terrainMapAtlas';

const invCols = float(1 / TERRAIN_ATLAS_COLS);
const invRows = float(1 / TERRAIN_ATLAS_COLS);

const surfSlotCell = float(TERRAIN_ATLAS_SURF_TILE_PX + TERRAIN_ATLAS_GUTTER_PX * 2);
const surfSlotInner = float(TERRAIN_ATLAS_SURF_TILE_PX).div(surfSlotCell);
const surfSlotGutter = float(TERRAIN_ATLAS_GUTTER_PX).div(surfSlotCell);

const dispSlotCell = float(TERRAIN_ATLAS_DISP_TILE_PX + TERRAIN_ATLAS_GUTTER_PX * 2);
const dispSlotInner = float(TERRAIN_ATLAS_DISP_TILE_PX).div(dispSlotCell);
const dispSlotGutter = float(TERRAIN_ATLAS_GUTTER_PX).div(dispSlotCell);

/** Map tiled surface UV + atlas slot index (0–6) to gutter-inset coordinates (2048 surface atlases). */
export const atlasTileUv = Fn(([uv, index]) => {
  const cols = float(TERRAIN_ATLAS_COLS);
  const col = index.mod(cols);
  const row = index.div(cols).floor();
  const fu = fract(uv.x).mul(surfSlotInner).add(surfSlotGutter);
  const fv = fract(uv.y).mul(surfSlotInner).add(surfSlotGutter);
  return vec2(
    fu.mul(invCols).add(col.mul(invCols)),
    fv.mul(invRows).add(row.mul(invRows)),
  );
});

/** Gutter-inset UV for the separate 1024 R8 displacement atlas. */
export const atlasTileUvDisp = Fn(([uv, index]) => {
  const cols = float(TERRAIN_ATLAS_COLS);
  const col = index.mod(cols);
  const row = index.div(cols).floor();
  const fu = fract(uv.x).mul(dispSlotInner).add(dispSlotGutter);
  const fv = fract(uv.y).mul(dispSlotInner).add(dispSlotGutter);
  return vec2(
    fu.mul(invCols).add(col.mul(invCols)),
    fv.mul(invRows).add(row.mul(invRows)),
  );
});

/** Undisplaced macro mesh XZ in world space — use for splat/disp UVs (not displaced positionWorld). */
export const macroSurfaceWorldXZ = Fn(() => {
  const worldPos = modelWorldMatrix.mul(vec4(positionGeometry, float(1))).xyz;
  return vec2(worldPos.x, worldPos.z);
});

/** World XZ scaled by per-biome tile repeat — use before atlasTileUv. */
export const biomeSurfaceUv = Fn(([worldXZ, repeat]) => worldXZ.mul(repeat));

/** Vertex-stage tiled surface atlas sample (path color overlay — 2048 atlas, no mips). */
export const sampleTiledAtlasVert = Fn(([tex, worldXZ, repeat, index]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  return tex.sample(atlasTileUv(tileUv, index));
});

/** Vertex-stage displacement atlas sample (1024 R8 atlas, NearestFilter). */
export const sampleTiledDispAtlasVert = Fn(([tex, worldXZ, repeat, index]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  return tex.sample(atlasTileUvDisp(tileUv, index));
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
