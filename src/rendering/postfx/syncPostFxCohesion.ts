// src/rendering/postfx/syncPostFxCohesion.ts — per-frame elevation-driven post-FX coupling
import type { PostFXContext } from '../PostFX';
import { getActivePostFxCohesion, samplePostFxCohesion } from './postfxCohesion';

export interface SyncPostFxCohesionOptions {
  vignetteEnergyRatio?: number;
  revealActive?: boolean;
}

const UNITY_SCALARS = {
  bloomSceneWeightMul: 1,
  godraysWeightMul: 1,
  vignetteDarknessMul: 1,
} as const;

/** Single entry: sky bloom mask, scene bloom weight, god-ray weight, optional reveal vignette bleed. */
export function syncPostFxCohesion(
  postFX: PostFXContext,
  elevationDeg: number,
  sunIntensity: number,
  options: SyncPostFxCohesionOptions = {},
): void {
  const cohesion = getActivePostFxCohesion();

  if (!cohesion.enabled) {
    postFX.setCohesionScalars(UNITY_SCALARS);
    postFX.setBloomSkyReduceFromSun(elevationDeg);
    postFX.setGodraysFromSun(sunIntensity, elevationDeg);
    return;
  }

  const sample = samplePostFxCohesion(elevationDeg);
  postFX.setCohesionScalars({
    bloomSceneWeightMul: sample.bloomSceneWeightMul,
    godraysWeightMul: sample.godraysWeightMul,
    vignetteDarknessMul: sample.vignetteDarknessMul,
  });
  postFX.setBloomSkyReduceFromSun(elevationDeg);
  postFX.setGodraysFromSun(sunIntensity, elevationDeg);

  if (options.revealActive && options.vignetteEnergyRatio !== undefined) {
    postFX.setVignetteStrength(options.vignetteEnergyRatio, sample.vignetteDarknessMul);
  }
}
