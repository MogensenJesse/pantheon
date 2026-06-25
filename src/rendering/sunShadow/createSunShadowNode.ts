// src/rendering/sunShadow/createSunShadowNode.ts — single shared shadow(sun) TSL node
import type { DirectionalLight } from 'three';
import { shadow } from 'three/tsl';

export type SunShadowNode = ReturnType<typeof shadow>;

let sunShadowNode: SunShadowNode | null = null;
let boundSun: DirectionalLight | null = null;

/** One shadow(sun) node shared across terrain, grass, props, and water materials. */
export function createSunShadowNode(sun: DirectionalLight): SunShadowNode {
  if (!sunShadowNode || boundSun !== sun) {
    sunShadowNode = shadow(sun);
    boundSun = sun;
  }
  return sunShadowNode;
}
