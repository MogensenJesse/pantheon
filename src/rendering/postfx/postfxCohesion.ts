// src/rendering/postfx/postfxCohesion.ts — elevation-driven post-FX master scalars
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { elevationToDayT, getActiveCycle, skyReduceForElevation } from '../sky/lightingCurves';

export interface PostFxCohesionConfig {
  enabled: boolean;
  goldenHourPower: number;
  bloomSceneWeight: { atNoon: number; atGoldenHour: number };
  godraysWeight: { atNoon: number; atGoldenHour: number };
  vignetteDarknessBleed: number;
}

export interface PostFxCohesionSample {
  goldenHourT: number;
  bloomSceneWeightMul: number;
  godraysWeightMul: number;
  vignetteDarknessMul: number;
  skyReduce: number;
}

/** Live cohesion config — DEV panel writes devSettings; production uses VISUAL. */
export function getActivePostFxCohesion(): PostFxCohesionConfig {
  if (import.meta.env.DEV) {
    return devSettings.postfx.cohesion;
  }
  return VISUAL.postfx.cohesion;
}

/**
 * 0..1 golden-hour factor — peaks at low sun, 0 at night (below sunrise) and near noon.
 */
export function goldenHourT(elevationDeg: number, cohesion?: PostFxCohesionConfig): number {
  const { sunriseElevationDeg } = getActiveCycle();
  if (elevationDeg <= sunriseElevationDeg) return 0;
  const dayT = elevationToDayT(elevationDeg);
  const nightT = 1 - dayT;
  const power = cohesion?.goldenHourPower ?? getActivePostFxCohesion().goldenHourPower;
  return nightT ** power;
}

function lerpEndpoints(atNoon: number, atGoldenHour: number, t: number): number {
  return MathUtils.lerp(atNoon, atGoldenHour, t);
}

/**
 * Post-FX multipliers for the current sun elevation. Real terrain occlusion
 * (`sunHorizonOcclusion.ts`) already gates god-ray visibility via `setGodraysFromSun`, so the
 * golden-hour boost here tracks `goldenHourT` directly (same curve as bloom) and applies
 * immediately once the sun is visible, instead of waiting for a further elevation delay.
 */
export function samplePostFxCohesion(elevationDeg: number): PostFxCohesionSample {
  const cohesion = getActivePostFxCohesion();
  const t = goldenHourT(elevationDeg, cohesion);
  return {
    goldenHourT: t,
    bloomSceneWeightMul: lerpEndpoints(
      cohesion.bloomSceneWeight.atNoon,
      cohesion.bloomSceneWeight.atGoldenHour,
      t,
    ),
    godraysWeightMul: lerpEndpoints(
      cohesion.godraysWeight.atNoon,
      cohesion.godraysWeight.atGoldenHour,
      t,
    ),
    vignetteDarknessMul: 1 - cohesion.vignetteDarknessBleed * t,
    skyReduce: skyReduceForElevation(elevationDeg),
  };
}
