// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeAtlasUv.ts — tile UV helper for 3×3 terrain map atlases
import { Fn, float, fract, vec2 } from 'three/tsl';
import { TERRAIN_ATLAS_COLS } from './terrainMapAtlas';

const invCols = float(1 / TERRAIN_ATLAS_COLS);
const invRows = float(1 / TERRAIN_ATLAS_COLS);

/** Map world UV + atlas slot index (0–6) to atlas sample coordinates. */
export const atlasTileUv = Fn(([uv, index]) => {
  const cols = float(TERRAIN_ATLAS_COLS);
  const col = index.mod(cols);
  const row = index.div(cols).floor();
  return vec2(fract(uv.x).mul(invCols).add(col.mul(invCols)), fract(uv.y).mul(invRows).add(row.mul(invRows)));
});
