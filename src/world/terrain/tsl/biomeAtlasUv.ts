// src/world/terrain/tsl/biomeAtlasUv.ts — tile UV helper for 3×3 terrain map atlases
import {
  clamp,
  dFdx,
  dFdy,
  Fn,
  float,
  fract,
  If,
  max,
  min,
  mix,
  modelWorldMatrix,
  positionGeometry,
  vec2,
  vec4,
} from 'three/tsl';
import {
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_DISP_TILE_PX,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_ROWS,
  TERRAIN_ATLAS_SURF_TILE_PX,
} from '../atlas/atlasConstants';
import {
  breakupBilinearStamps,
  breakupLatticeP,
  breakupMixActive,
  breakupStampTileUv,
  breakupStampWeight,
} from './terrainTextureBreakupTsl';

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

const dispSlotCell = float(TERRAIN_ATLAS_DISP_TILE_PX + TERRAIN_ATLAS_GUTTER_PX * 2);
const dispSlotInner = float(TERRAIN_ATLAS_DISP_TILE_PX).div(dispSlotCell);
const dispSlotGutter = float(TERRAIN_ATLAS_GUTTER_PX).div(dispSlotCell);

/** Map tiled surface UV + atlas slot index (0–8) to gutter-inset coordinates (surface atlases). */
export const atlasTileUv = Fn(([uv, index]: TslNode[]) => {
  const cols = float(TERRAIN_ATLAS_COLS);
  const col = index.mod(cols);
  const row = index.div(cols).floor();
  const fu = fract(uv.x).mul(surfSlotInner).add(surfSlotGutter);
  const fv = fract(uv.y).mul(surfSlotInner).add(surfSlotGutter);
  return vec2(fu.mul(invCols).add(col.mul(invCols)), fv.mul(invRows).add(row.mul(invRows)));
});

/** Gutter-inset UV for the R8 displacement atlas (tile size from `TERRAIN_ATLAS_DISP_TILE_PX`). */
export const atlasTileUvDisp = Fn(([uv, index]: TslNode[]) => {
  const cols = float(TERRAIN_ATLAS_COLS);
  const col = index.mod(cols);
  const row = index.div(cols).floor();
  const fu = fract(uv.x).mul(dispSlotInner).add(dispSlotGutter);
  const fv = fract(uv.y).mul(dispSlotInner).add(dispSlotGutter);
  return vec2(fu.mul(invCols).add(col.mul(invCols)), fv.mul(invRows).add(row.mul(invRows)));
});

/** Undisplaced macro mesh XZ in world space — use for splat/disp UVs (not displaced positionWorld). */
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

/** Vertex-stage displacement atlas sample (R8 atlas, NearestFilter). */
export const sampleTiledDispAtlasVert = Fn(([tex, worldXZ, repeat, index]: TslNode[]) => {
  const tileUv = biomeSurfaceUv(worldXZ, repeat);
  return tex.sample(atlasTileUvDisp(tileUv, index));
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

/**
 * Albedo breakup: sample UV A, then 4 UV-B stamps of the containing cell (hermite
 * bilinear window × radial falloff from center, warped lattice, per-stamp rotate)
 * when `mixW` is live. `gradsB` from unrotated macro `worldXZB`.
 */
export const sampleTiledAtlasBreakup = Fn(
  ([
    tex,
    worldXZ,
    worldXZB,
    repeat,
    index,
    gradsA,
    gradsB,
    mixW,
    patchRotate,
    patchRadius,
    patchFade,
  ]: TslNode[]) => {
    const a = sampleTiledAtlasWithGrad(tex, worldXZ, repeat, index, gradsA).toVar();
    If(breakupMixActive(mixW), () => {
      const p = worldXZB.mul(repeat);
      const q = breakupLatticeP(p);
      const cells = breakupBilinearStamps(q);
      const rpt = max(repeat, float(1e-6));
      const sampleStamp = (vx: TslNode, vy: TslNode, bilinear: TslNode) => {
        const w = breakupStampWeight(q, vx, vy, patchRadius, patchFade).mul(bilinear);
        const col = sampleTiledAtlasWithGrad(
          tex,
          breakupStampTileUv(p, vx, vy, patchRotate).div(rpt),
          repeat,
          index,
          gradsB,
        ).rgb;
        return { col, w };
      };
      const s00 = sampleStamp(cells.v00x, cells.v00y, cells.b00);
      const s10 = sampleStamp(cells.v10x, cells.v10y, cells.b10);
      const s01 = sampleStamp(cells.v01x, cells.v01y, cells.b01);
      const s11 = sampleStamp(cells.v11x, cells.v11y, cells.b11);
      const wSum = max(s00.w.add(s10.w).add(s01.w).add(s11.w), float(1e-3));
      const bRgb = s00.col
        .mul(s00.w)
        .add(s10.col.mul(s10.w))
        .add(s01.col.mul(s01.w))
        .add(s11.col.mul(s11.w))
        .div(wSum);
      a.assign(mix(a, vec4(bRgb, a.w), mixW));
    });
    return a;
  },
);

export { terrainMapUv } from '../../../map/mapUvTsl';
