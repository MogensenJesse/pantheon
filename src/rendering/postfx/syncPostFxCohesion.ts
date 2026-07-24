// src/rendering/postfx/syncPostFxCohesion.ts — per-frame elevation-driven post-FX coupling
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../PostFX';
import { getActivePostFxCohesion, samplePostFxCohesion } from './postfxCohesion';

export interface SyncPostFxCohesionOptions {
  vignetteEnergyRatio?: number;
  revealActive?: boolean;
  /** Terrain-silhouette horizon elevation (deg) toward the sun — see `sunHorizonOcclusion.ts`. */
  horizonElevationDeg?: number;
}

const UNITY_SCALARS = {
  bloomSceneWeightMul: 1,
  godraysWeightMul: 1,
  vignetteDarknessMul: 1,
} as const;

const _COHESION_SCALARS = {
  bloomSceneWeightMul: 1,
  godraysWeightMul: 1,
  vignetteDarknessMul: 1,
};

/** Single entry: sky bloom mask, scene bloom weight, god-ray weight, optional reveal vignette bleed. */
export function syncPostFxCohesion(
  postFX: PostFXContext,
  elevationDeg: number,
  sunIntensity: number,
  options: SyncPostFxCohesionOptions = {},
): void {
  const cohesion = getActivePostFxCohesion();
  const horizonElevationDeg = options.horizonElevationDeg ?? -90;
  const elevAboveHorizonDeg = elevationDeg - horizonElevationDeg;
  // Golden-hour cohesion boost must not amplify a soft occluded edge — same elev ramp as weight.
  const elevRamp = MathUtils.smoothstep(
    elevAboveHorizonDeg,
    VISUAL.godrays.ELEV_WEIGHT_START_DEG,
    VISUAL.godrays.ELEV_WEIGHT_END_DEG,
  );

  if (!cohesion.enabled) {
    postFX.setCohesionScalars(UNITY_SCALARS);
    postFX.setBloomSkyReduceFromSun(elevationDeg);
    postFX.setGodraysFromSun(sunIntensity, elevationDeg, horizonElevationDeg);
    return;
  }

  const sample = samplePostFxCohesion(elevationDeg);
  _COHESION_SCALARS.bloomSceneWeightMul = sample.bloomSceneWeightMul;
  // Scale only the golden-hour *boost* by elevRamp (not the whole mul) so a clear sun still
  // gets noon baseline while an occluded soft edge cannot be 1.5× amplified.
  const noonMul = cohesion.godraysWeight.atNoon;
  const goldenMul = sample.godraysWeightMul;
  _COHESION_SCALARS.godraysWeightMul = noonMul + (goldenMul - noonMul) * elevRamp;
  _COHESION_SCALARS.vignetteDarknessMul = sample.vignetteDarknessMul;
  postFX.setCohesionScalars(_COHESION_SCALARS);
  postFX.setBloomSkyReduceFromSun(elevationDeg);
  postFX.setGodraysFromSun(sunIntensity, elevationDeg, horizonElevationDeg);

  if (options.revealActive && options.vignetteEnergyRatio !== undefined) {
    postFX.setVignetteStrength(options.vignetteEnergyRatio, sample.vignetteDarknessMul);
  }
}
