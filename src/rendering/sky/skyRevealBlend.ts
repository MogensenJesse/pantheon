// src/rendering/sky/skyRevealBlend.ts — elevation-driven atmosphere + exposure
import { Color } from 'three';
import { isRevealSunriseInProgress } from '../../core/reveal/WorldReveal';
import type { PostFXContext } from '../PostFX';
import { sampleTodColor, sampleTodStop, todWeights } from '../tod/todBlend';
import { getActiveLightingSample, orbWorldLightnessT } from './lightingCurves';
import type { SkySystemContext } from './SkySystem';
import { SKY_DEFAULTS, type SkyAtmosphereScalars, type SkyRevealAtmosphere } from './skyDefaults';
import { getActiveSkyAtmosphereStops, mergeSkyWithDevOverrides } from './skyDevOverrides';

const _atmOut: SkyAtmosphereScalars = {
  turbidity: 0,
  rayleigh: 0,
  mieCoefficient: 0,
  mieDirectionalG: 0,
};
const _tintScratch = new Color();

function atmosphereScalarsOnly(
  stop: ReturnType<typeof getActiveSkyAtmosphereStops>['noon'],
): SkyAtmosphereScalars {
  return {
    turbidity: stop.turbidity,
    rayleigh: stop.rayleigh,
    mieCoefficient: stop.mieCoefficient,
    mieDirectionalG: stop.mieDirectionalG,
  };
}

/** Night / golden / noon Preetham blend from shared TOD band weights. */
export function blendSkyForReveal(elevationDeg: number): SkyRevealAtmosphere {
  const stops = getActiveSkyAtmosphereStops();
  const atm = sampleTodStop(
    {
      night: atmosphereScalarsOnly(stops.night),
      goldenHour: atmosphereScalarsOnly(stops.goldenHour),
      noon: atmosphereScalarsOnly(stops.noon),
    },
    elevationDeg,
    _atmOut,
  );

  return {
    ...atm,
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

/** Apply Preetham atmosphere + dual exposure + sky tint from sun elevation. */
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
  const params = mergeSkyWithDevOverrides(blendSkyForReveal(elevationDeg));
  const stops = getActiveSkyAtmosphereStops();
  sampleTodColor(
    {
      night: stops.night.tint,
      goldenHour: stops.goldenHour.tint,
      noon: stops.noon.tint,
    },
    elevationDeg,
    _tintScratch,
  );

  sky.setSkyParams(params);
  sky.setSkyExposure(lighting.skyExposure);
  sky.setSkyTint(_tintScratch);
  postFX.setAgxExposure(lighting.globalExposure);

  lastAppliedElevation = elevationDeg;
  lastAppliedOrbLift = orbWorldLightnessT();
  lastRevealAtmosphere = params;
  return params;
}

/** DEV readout — current TOD weights at elevation. */
export function skyTodWeightsForElevation(elevationDeg: number) {
  return todWeights(elevationDeg);
}
