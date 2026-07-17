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
 * PCSS uses PcssShadowNode (color-depth RT); otherwise stock shadow(sun) + filterNode.
 */
export function createSunShadowNode(sun: DirectionalLight): SunShadowNode {
  if (!sunShadowNode || boundSun !== sun) {
    const lighting = VISUAL.shadows.lighting;
    const usePcss = lighting.usePcss && !lighting.useSoftShadowMap;
    sunShadowNode = usePcss ? new PcssShadowNode(sun) : shadow(sun);
    boundSun = sun;
  }
  return sunShadowNode;
}
