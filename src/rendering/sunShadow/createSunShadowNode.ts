// src/rendering/sunShadow/createSunShadowNode.ts — main/far coverage shadow(sun) for clouds + far ground
import type { DirectionalLight } from 'three';
import { shadow } from 'three/tsl';

export type SunShadowNode = ReturnType<typeof shadow>;

let sunShadowNode: SunShadowNode | null = null;
let boundSun: DirectionalLight | null = null;

/**
 * Shared coverage shadow node for the main/far sun map.
 * Used by cloud mesh receive and ground beyond the near ring.
 */
export function createSunShadowNode(sun: DirectionalLight): SunShadowNode {
  if (!sunShadowNode || boundSun !== sun) {
    sunShadowNode = shadow(sun);
    boundSun = sun;
  }
  return sunShadowNode;
}
