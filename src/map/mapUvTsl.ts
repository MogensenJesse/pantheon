// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/map/mapUvTsl.ts — shared world XZ → painted map texture UV (terrain + grass)
import { vec2 } from 'three/tsl';

/** Match terrain splat / grass compute: world XZ → [0,1]² map UV. */
export function worldXZToMapUv(worldX, worldZ, uWorldSize) {
  return vec2(worldX, worldZ).div(uWorldSize).add(0.5);
}
