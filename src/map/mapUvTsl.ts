// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/map/mapUvTsl.ts — shared world XZ → painted map texture UV (terrain + grass)
import { Fn, vec2 } from 'three/tsl';

/** World XZ → [0,1]² painted map UV (terrain splat + grass compute). */
export const terrainMapUv = Fn(([worldSize, worldXZ]) => worldXZ.div(worldSize).add(0.5));

/** Scalar X/Z components → same map UV as `terrainMapUv`. */
export function worldXZToMapUv(worldX, worldZ, uWorldSize) {
  return terrainMapUv(uWorldSize, vec2(worldX, worldZ));
}
