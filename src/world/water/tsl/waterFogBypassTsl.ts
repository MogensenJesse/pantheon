// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/water/tsl/waterFogBypassTsl.ts — reduce night valley fog over shallow refracting water
import type { Node } from 'three/webgpu';
import type { WaterShoreUniforms } from '../waterShoreUniforms';
import { waterRefractionWeightTsl } from './waterRefractionTsl';

/** [0,1] fog reduction — high where screen refraction / shore translucency matters. */
export function waterShoreFogBypassTsl(refractMask: Node, shore: WaterShoreUniforms): Node {
  return waterRefractionWeightTsl(refractMask, shore).mul(shore.uFogBypassStrength).clamp(0, 1);
}
