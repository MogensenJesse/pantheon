// src/rendering/sunShadow/createSunShadowNode.ts — main/far hard shadow(sun) for clouds + godrays
import type { DirectionalLight } from 'three';
import { shadow } from 'three/tsl';

export type SunShadowNode = ReturnType<typeof shadow>;

let sunShadowNode: SunShadowNode | null = null;
let boundSun: DirectionalLight | null = null;

/**
 * Shared hard shadow node for the main/far sun map.
 * Used by cloud mesh receive (+ godrays depth compare samples the same light's depth).
 * Ground receivers use {@link createNearCascadeShadowNode} instead.
 */
export function createSunShadowNode(sun: DirectionalLight): SunShadowNode {
  if (!sunShadowNode || boundSun !== sun) {
    sunShadowNode = shadow(sun);
    boundSun = sun;
  }
  return sunShadowNode;
}
