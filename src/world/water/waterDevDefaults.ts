// src/world/water/waterDevDefaults.ts — DEV-tunable WaterMesh look knobs
import { WATER_DAY, WATER_NIGHT, WATER_PARAMS } from './waterConfig';

/** Live-tunable subset of the water look (colours stay config-driven). */
export const WATER_DEV_DEFAULTS = {
  /** Normal-map UV repeat density across world XZ. */
  size: WATER_PARAMS.size,
  /** Surface opacity (1 = opaque reflective sheet). */
  alpha: WATER_PARAMS.alpha,
  /** Reflection wave distortion at full daylight. */
  distortionDay: WATER_DAY.distortionScale,
  /** Reflection wave distortion at full night. */
  distortionNight: WATER_NIGHT.distortionScale,
};

export type WaterDevSettings = typeof WATER_DEV_DEFAULTS;

export function resetWaterDev(target: WaterDevSettings): void {
  Object.assign(target, WATER_DEV_DEFAULTS);
}
