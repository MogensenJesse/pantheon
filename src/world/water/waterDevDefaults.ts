// src/world/water/waterDevDefaults.ts — DEV-tunable WaterMesh look knobs
import { VISUAL } from '../../config/visualTuning';

import type { WaterDevSettings } from '../../core/GameState';

/** Live-tunable subset of the water look (colours stay in waterConfig). */
export const WATER_DEV_DEFAULTS: WaterDevSettings = { ...VISUAL.water };

export function resetWaterDev(target: WaterDevSettings): void {
  Object.assign(target, VISUAL.water);
}
