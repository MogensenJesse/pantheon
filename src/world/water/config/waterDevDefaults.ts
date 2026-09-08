// src/world/water/config/waterDevDefaults.ts — DEV reset for water panel sliders
import { VISUAL } from '../../../config/visualTuning';
import type { WaterDevSettings } from '../../../core/GameState';

function waterDevDefaultsSnapshot(): WaterDevSettings {
  return {
    size: VISUAL.water.size,
    alpha: VISUAL.water.alpha,
    reflectionPlaneOffsetM: VISUAL.water.reflectionPlaneOffsetM,
    resolutionScale: VISUAL.water.resolutionScale,
    stops: structuredClone(VISUAL.water.stops) as WaterDevSettings['stops'],
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
  target.reflectionPlaneOffsetM = defaults.reflectionPlaneOffsetM;
  target.resolutionScale = defaults.resolutionScale;
  target.stops = structuredClone(defaults.stops);
  Object.assign(target.shoreDepth, defaults.shoreDepth);
  Object.assign(target.tide, defaults.tide);
}
