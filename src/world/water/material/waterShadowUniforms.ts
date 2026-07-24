// src/world/water/material/waterShadowUniforms.ts — shared sun shadow uniforms for water materials
import { uniform } from 'three/tsl';
// Imported from the leaf profile module (not the `sunShadow` barrel) to avoid an import
// cycle: the barrel re-exports `syncSunShadowReceivers`, which itself imports this file.
import { WATER_SHADOW_FLOOR_DEFAULT } from '../../../rendering/sunShadow/sunShadowProfiles';

export interface WaterShadowUniforms {
  uShadowFloor: ReturnType<typeof uniform>;
  uSunIntensity: ReturnType<typeof uniform>;
}

export const waterShadowUniforms: WaterShadowUniforms = {
  uShadowFloor: uniform(WATER_SHADOW_FLOOR_DEFAULT),
  uSunIntensity: uniform(0),
};
