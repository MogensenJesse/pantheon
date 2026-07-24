// src/rendering/postfx/godraysHorizonDevDefaults.ts — DEV horizon-occlusion tunables reset
import { VISUAL } from '../../config/visualTuning';
import type { GodraysHorizonDevSettings } from '../../core/GameState';

export const GODRAYS_HORIZON_DEV_DEFAULTS: GodraysHorizonDevSettings = {
  enabled: true,
  maxDistanceM: VISUAL.godrays.horizonOcclusion.maxDistanceM,
  sampleCount: VISUAL.godrays.horizonOcclusion.sampleCount,
  rayFanCount: VISUAL.godrays.horizonOcclusion.rayFanCount,
  rayFanSpreadDeg: VISUAL.godrays.horizonOcclusion.rayFanSpreadDeg,
  smoothRatePerSec: VISUAL.godrays.horizonOcclusion.smoothRatePerSec,
  hardOccludeMarginDeg: VISUAL.godrays.horizonOcclusion.hardOccludeMarginDeg,
};

export function resetGodraysHorizonDev(target: GodraysHorizonDevSettings): void {
  Object.assign(target, GODRAYS_HORIZON_DEV_DEFAULTS);
}
