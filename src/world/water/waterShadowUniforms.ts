// src/world/water/waterShadowUniforms.ts — shared sun shadow uniforms for water materials
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

export const WATER_SHADOW_FLOOR_DEFAULT = VISUAL.water.shadowFloor;

export interface WaterShadowUniforms {
  uShadowFloor: ReturnType<typeof uniform>;
  uSunIntensity: ReturnType<typeof uniform>;
}

export const waterShadowUniforms: WaterShadowUniforms = {
  uShadowFloor: uniform(WATER_SHADOW_FLOOR_DEFAULT),
  uSunIntensity: uniform(0),
};
