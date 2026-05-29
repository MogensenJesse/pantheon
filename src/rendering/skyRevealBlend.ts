// src/rendering/skyRevealBlend.ts — night→day atmosphere lerp for energy reveal
import { MathUtils } from 'three';
import type { PostFXContext } from './PostFX';
import type { SkySystemContext } from './SkySystem';
import { mergeSkyWithDevOverrides } from './skyDevOverrides';
import { SKY_DAY, SKY_DEFAULTS, SKY_NIGHT, type SkyRevealAtmosphere } from './skyDefaults';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linear blend SKY_NIGHT → SKY_DAY by reveal progress (0–1). */
export function blendSkyForReveal(t: number): SkyRevealAtmosphere {
  const tt = MathUtils.clamp(t, 0, 1);
  const night = SKY_NIGHT;
  const day = SKY_DAY;

  return {
    turbidity: lerp(night.turbidity, day.turbidity, tt),
    rayleigh: lerp(night.rayleigh, day.rayleigh, tt),
    mieCoefficient: lerp(night.mieCoefficient, day.mieCoefficient, tt),
    mieDirectionalG: lerp(night.mieDirectionalG, day.mieDirectionalG, tt),
    cloudCoverage: lerp(night.cloudCoverage, day.cloudCoverage, tt),
    cloudDensity: SKY_DEFAULTS.cloudDensity,
    cloudElevation: SKY_DEFAULTS.cloudElevation,
    showSunDisc: SKY_DEFAULTS.showSunDisc,
    fogDensity: SKY_DEFAULTS.fogDensity,
    exposure: lerp(night.exposure, day.exposure, tt),
  };
}

export function applySkyForReveal(
  sky: SkySystemContext,
  postFX: PostFXContext,
  t: number,
): SkyRevealAtmosphere {
  const params = mergeSkyWithDevOverrides(blendSkyForReveal(t));
  sky.setSkyParams(params);
  postFX.setBloomParams({ exposure: params.exposure });
  return params;
}
