// src/rendering/sunShadow/createSunShadowNode.ts — single shared shadow(sun) TSL node
import type { DirectionalLight } from 'three';
import { shadow } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { PcssShadowNode } from './pcssShadowNode';

export type SunShadowNode = ReturnType<typeof shadow> | PcssShadowNode;

let sunShadowNode: SunShadowNode | null = null;
let boundSun: DirectionalLight | null = null;

/**
 * One shadow node shared across terrain, grass, props, clouds, and water.
 *
 * When the near cascade is enabled, the main/far sun map is **coverage only** (stock
 * shadow() + CoverageShadowFilter) so min(near, far) does not stack a huge far PCSS
 * halo over sharp near contact. Soft PCSS lives on the near light instead.
 */
export function createSunShadowNode(sun: DirectionalLight): SunShadowNode {
  if (!sunShadowNode || boundSun !== sun) {
    const lighting = VISUAL.shadows.lighting;
    const nearOwnsSoft = lighting.near.enabled;
    const usePcss = lighting.usePcss && !lighting.useSoftShadowMap && !nearOwnsSoft;
    sunShadowNode = usePcss ? new PcssShadowNode(sun) : shadow(sun);
    boundSun = sun;
  }
  return sunShadowNode;
}
