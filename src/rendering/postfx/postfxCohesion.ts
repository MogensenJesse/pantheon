// src/rendering/postfx/postfxCohesion.ts — elevation-driven post-FX master scalars
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { elevationToDayT, getActiveCycle } from '../sky/lightingCurves';

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
}

const _COHESION_SAMPLE: PostFxCohesionSample = {
  goldenHourT: 0,
  bloomSceneWeightMul: 1,
  godraysWeightMul: 1,
  vignetteDarknessMul: 1,
};

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

/**
 * Post-FX multipliers for the current sun elevation. God-ray golden-hour boost tracks
 * `goldenHourT` like bloom; `syncPostFxCohesion` scales only the boost above noon by the
 * elevation-above-horizon ramp so a soft occluded edge cannot be 1.5× amplified.
 */
export function samplePostFxCohesion(elevationDeg: number): PostFxCohesionSample {
  const cohesion = getActivePostFxCohesion();
  const t = goldenHourT(elevationDeg, cohesion);
  _COHESION_SAMPLE.goldenHourT = t;
  _COHESION_SAMPLE.bloomSceneWeightMul = MathUtils.lerp(
    cohesion.bloomSceneWeight.atNoon,
    cohesion.bloomSceneWeight.atGoldenHour,
    t,
  );
  _COHESION_SAMPLE.godraysWeightMul = MathUtils.lerp(
    cohesion.godraysWeight.atNoon,
    cohesion.godraysWeight.atGoldenHour,
    t,
  );
  _COHESION_SAMPLE.vignetteDarknessMul = 1 - cohesion.vignetteDarknessBleed * t;
  return _COHESION_SAMPLE;
}
