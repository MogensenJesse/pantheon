// src/rendering/sky/skyRevealBlend.ts — elevation-driven atmosphere + exposure
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { isRevealSunriseInProgress } from '../../core/reveal/WorldReveal';
import type { PostFXContext } from '../PostFX';
import { getActiveLightingSample, orbWorldLightnessT } from './lightingCurves';
import type { SkySystemContext } from './SkySystem';
import { SKY_DAY, SKY_DEFAULTS, SKY_NIGHT, type SkyRevealAtmosphere } from './skyDefaults';
import { mergeSkyWithDevOverrides } from './skyDevOverrides';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Procedural mesh clouds own sky cloud visuals — keep Preetham atmosphere only. */
function skyMeshCloudCoverage(t: number): number {
  if (VISUAL.clouds.enabled) return 0;
  const tt = MathUtils.clamp(t, 0, 1);
  return lerp(SKY_NIGHT.cloudCoverage, SKY_DAY.cloudCoverage, tt);
}

function applySkyMeshCloudGate(params: SkyRevealAtmosphere): SkyRevealAtmosphere {
  if (!VISUAL.clouds.enabled) return params;
  return { ...params, cloudCoverage: 0 };
}

/** Linear blend SKY_NIGHT → SKY_DAY by atmosphere blend factor (0–1). */
export function blendSkyForReveal(t: number): SkyRevealAtmosphere {
  const tt = MathUtils.clamp(t, 0, 1);
  const night = SKY_NIGHT;
  const day = SKY_DAY;

  return {
    turbidity: lerp(night.turbidity, day.turbidity, tt),
    rayleigh: lerp(night.rayleigh, day.rayleigh, tt),
    mieCoefficient: lerp(night.mieCoefficient, day.mieCoefficient, tt),
    mieDirectionalG: lerp(night.mieDirectionalG, day.mieDirectionalG, tt),
    cloudCoverage: skyMeshCloudCoverage(tt),
    cloudDensity: SKY_DEFAULTS.cloudDensity,
    cloudElevation: SKY_DEFAULTS.cloudElevation,
    showSunDisc: SKY_DEFAULTS.showSunDisc,
  };
}

const ELEVATION_EPSILON = 0.02;
const ORB_LIFT_EPSILON = 1e-5;
let lastAppliedElevation = Number.NaN;
let lastAppliedOrbLift = Number.NaN;
let lastRevealAtmosphere: SkyRevealAtmosphere | null = null;

/** Clears reveal cache (e.g. after dev sky override changes). */
export function invalidateSkyRevealCache(): void {
  lastAppliedElevation = Number.NaN;
  lastAppliedOrbLift = Number.NaN;
  lastRevealAtmosphere = null;
}

/** Apply Preetham atmosphere + dual exposure from sun elevation. */
export function applySkyForReveal(
  sky: SkySystemContext,
  postFX: PostFXContext,
  elevationDeg: number,
): SkyRevealAtmosphere {
  if (
    !isRevealSunriseInProgress() &&
    lastRevealAtmosphere !== null &&
    Number.isFinite(lastAppliedElevation) &&
    Math.abs(elevationDeg - lastAppliedElevation) < ELEVATION_EPSILON &&
    Math.abs(orbWorldLightnessT() - lastAppliedOrbLift) < ORB_LIFT_EPSILON
  ) {
    return lastRevealAtmosphere;
  }

  const lighting = getActiveLightingSample(elevationDeg);
  const params = applySkyMeshCloudGate(
    mergeSkyWithDevOverrides(blendSkyForReveal(lighting.atmosphereBlendT)),
  );

  sky.setSkyParams(params);
  sky.setSkyExposure(lighting.skyExposure);
  postFX.setAgxExposure(lighting.globalExposure);

  lastAppliedElevation = elevationDeg;
  lastAppliedOrbLift = orbWorldLightnessT();
  lastRevealAtmosphere = params;
  return params;
}
