// src/world/terrain/tsl/biomeAtlasUv.ts — tile UV helper for 3×3 terrain map atlases
import {
  clamp,
  dFdx,
  dFdy,
  Fn,
  float,
  fract,
  min,
  modelWorldMatrix,
  positionGeometry,
  vec2,
  vec4,
} from 'three/tsl';
import {
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_ROWS,
  TERRAIN_ATLAS_SURF_TILE_PX,
} from '../atlas/atlasConstants';

type TslNode = any;

const invCols = float(1 / TERRAIN_ATLAS_COLS);
const invRows = float(1 / TERRAIN_ATLAS_ROWS);

const surfSlotCell = float(TERRAIN_ATLAS_SURF_TILE_PX + TERRAIN_ATLAS_GUTTER_PX * 2);
const surfSlotInner = float(TERRAIN_ATLAS_SURF_TILE_PX).div(surfSlotCell);
const surfSlotGutter = float(TERRAIN_ATLAS_GUTTER_PX).div(surfSlotCell);
/** d(atlas UV) / d(tile UV) — slot is 1/cols of the atlas, then gutter-inset. */
const atlasFromTileX = invCols.mul(surfSlotInner);
const atlasFromTileY = invRows.mul(surfSlotInner);
/** Keep clamp(fract, half, 1-half) from inverting when the footprint exceeds one tile. */
const tileUvInsetMax = float(0.499);

/** Map tiled surface UV + atlas slot index (0–8) to gutter-inset coordinates (surface atlases). */
export const atlasTileUv = Fn(([uv, index]: TslNode[]) => {
  const cols = float(TERRAIN_ATLAS_COLS);
  const col = index.mod(cols);
  const row = index.div(cols).floor();
  const fu = fract(uv.x).mul(surfSlotInner).add(surfSlotGutter);
  const fv = fract(uv.y).mul(surfSlotInner).add(surfSlotGutter);
  return vec2(fu.mul(invCols).add(col.mul(invCols)), fv.mul(invRows).add(row.mul(invRows)));
});

/** Undisplaced macro mesh XZ in world space — use for splat UVs (not displaced positionWorld). */
export const macroSurfaceWorldXZ = Fn(() => {
  const worldPos = modelWorldMatrix.mul(vec4(positionGeometry, float(1))).xyz;
  return vec2(worldPos.x, worldPos.z);
});

/** World XZ scaled by per-biome tile repeat — use before atlasTileUv. */
export const biomeSurfaceUv = Fn(([worldXZ, repeat]: TslNode[]) => worldXZ.mul(repeat));

/** Vertex-stage tiled surface atlas sample (path color overlay — no mips). */
export const sampleTiledAtlasVert = Fn(([tex, worldXZ, repeat, index]: TslNode[]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  return tex.sample(atlasTileUv(tileUv, index));
});

/**
 * Continuous tile-UV gradients mapped into atlas UV (must run in uniform control flow).
 * Scale includes `surfSlotInner` so LOD matches the gutter-inset sample.
 */
export const biomeAtlasTileGrads = Fn(([worldXZ, repeat]: TslNode[]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  return vec4(
    (dFdx as any)(tileUv.x).mul(atlasFromTileX),
    (dFdx as any)(tileUv.y).mul(atlasFromTileY),
    (dFdy as any)(tileUv.x).mul(atlasFromTileX),
    (dFdy as any)(tileUv.y).mul(atlasFromTileY),
  );
});

/**
 * Fragment atlas sample with precomputed grads — legal inside divergent `If` branches
 * (textureSampleGrad; derivatives were taken outside the branch).
 *
 * LOD uses the full (unclamped) gradients so distant pixels hit coarse mips — clamping
 * the footprint to a few texels forced mip 0 across the landscape (noise + cache thrash).
 * Tile UV is inset by half the pixel footprint so that kernel never sits on the slot
 * edge, where whole-atlas toktx mips bleed the neighbor biome.
 */
export const sampleTiledAtlasWithGrad = Fn(([tex, worldXZ, repeat, index, grads]: TslNode[]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  const ddx = grads.xy;
  const ddy = grads.zw;
  const halfU = min(tileUvInsetMax, ddx.x.abs().add(ddy.x.abs()).mul(0.5).div(atlasFromTileX));
  const halfV = min(tileUvInsetMax, ddx.y.abs().add(ddy.y.abs()).mul(0.5).div(atlasFromTileY));
  const insetUv = vec2(
    clamp(fract(tileUv.x), halfU, float(1).sub(halfU)),
    clamp(fract(tileUv.y), halfV, float(1).sub(halfV)),
  );
  return tex.sample(atlasTileUv(insetUv, index)).grad(ddx, ddy);
});

/**
 * Fragment-stage mip-safe tiled atlas sample.
 * Sample UV uses fract(tileUv) (inset by the filter footprint) but mip LOD uses
 * derivatives of continuous tileUv so repeat boundaries do not spike dFdx/dFdy.
 */
export const sampleTiledAtlas = Fn(([tex, worldXZ, repeat, index]: TslNode[]) =>
  sampleTiledAtlasWithGrad(tex, worldXZ, repeat, index, biomeAtlasTileGrads(worldXZ, repeat)),
);

export { terrainMapUv } from '../../../map/mapUvTsl';
