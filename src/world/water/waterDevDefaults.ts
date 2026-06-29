// src/world/water/waterDevDefaults.ts — DEV-tunable WaterMesh look knobs
import { VISUAL } from '../../config/visualTuning';

import type { WaterDevSettings } from '../../core/GameState';

/** Live-tunable subset of the water look (colours stay in waterConfig). */
export const WATER_DEV_DEFAULTS: WaterDevSettings = {
  size: VISUAL.water.size,
  alpha: VISUAL.water.alpha,
  distortionDay: VISUAL.water.distortionDay,
  distortionNight: VISUAL.water.distortionNight,
  resolutionScale: VISUAL.water.resolutionScale,
  shoreDepth: { ...VISUAL.water.shoreDepth },
  tide: { ...VISUAL.water.tide },
};

export function resetWaterDev(target: WaterDevSettings): void {
  target.size = WATER_DEV_DEFAULTS.size;
  target.alpha = WATER_DEV_DEFAULTS.alpha;
  target.distortionDay = WATER_DEV_DEFAULTS.distortionDay;
  target.distortionNight = WATER_DEV_DEFAULTS.distortionNight;
  target.resolutionScale = WATER_DEV_DEFAULTS.resolutionScale;
  Object.assign(target.shoreDepth, WATER_DEV_DEFAULTS.shoreDepth);
  Object.assign(target.tide, WATER_DEV_DEFAULTS.tide);
}
