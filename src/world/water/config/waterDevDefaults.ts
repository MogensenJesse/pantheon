// src/world/water/config/waterDevDefaults.ts — DEV reset for water panel sliders
import { VISUAL } from '../../../config/visualTuning';
import type { WaterDevSettings } from '../../../core/GameState';

function waterDevDefaultsSnapshot(): WaterDevSettings {
  return {
    size: VISUAL.water.size,
    alpha: VISUAL.water.alpha,
    distortionDay: VISUAL.water.distortionDay,
    distortionNight: VISUAL.water.distortionNight,
    reflectionPlaneOffsetM: VISUAL.water.reflectionPlaneOffsetM,
    resolutionScale: VISUAL.water.resolutionScale,
    shoreDepth: { ...VISUAL.water.shoreDepth },
    tide: { ...VISUAL.water.tide },
  };
}

/** Restore runtime water sliders to shipped VISUAL defaults (DEV panel only). */
export function resetWaterDev(target: WaterDevSettings): void {
  if (!import.meta.env.DEV) return;

  const defaults = waterDevDefaultsSnapshot();
  target.size = defaults.size;
  target.alpha = defaults.alpha;
  target.distortionDay = defaults.distortionDay;
  target.distortionNight = defaults.distortionNight;
  target.reflectionPlaneOffsetM = defaults.reflectionPlaneOffsetM;
  target.resolutionScale = defaults.resolutionScale;
  Object.assign(target.shoreDepth, defaults.shoreDepth);
  Object.assign(target.tide, defaults.tide);
}
