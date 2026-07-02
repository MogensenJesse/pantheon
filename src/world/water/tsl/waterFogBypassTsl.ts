// src/world/water/tsl/waterFogBypassTsl.ts — reduce night valley fog over shallow refracting water
import type { WaterShoreUniforms } from '../waterShoreUniforms';
import { waterWaveUniforms } from '../waterWaveUniforms';
import { waterRefractionWeightTsl } from './waterRefractionTsl';

type TslNode = any;

/** [0,1] fog reduction — high where screen refraction / shore translucency matters. */
export function waterShoreFogBypassTsl(refractMask: TslNode, shore: WaterShoreUniforms): TslNode {
  return waterRefractionWeightTsl(refractMask, shore)
    .mul(waterWaveUniforms.uShoreFogBypass)
    .clamp(0, 1);
}
