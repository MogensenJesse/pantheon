// src/world/water/waterDevDefaults.ts — DEV-tunable WaterMesh look knobs
import { VISUAL } from '../../config/visualTuning';

/** Live-tunable subset of the water look (colours stay in waterConfig). */
export const WATER_DEV_DEFAULTS = { ...VISUAL.water };

export type WaterDevSettings = typeof WATER_DEV_DEFAULTS;

export function resetWaterDev(target: WaterDevSettings): void {
  Object.assign(target, VISUAL.water);
}
