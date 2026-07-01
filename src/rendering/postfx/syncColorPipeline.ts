// src/rendering/postfx/syncColorPipeline.ts — per-frame sky exposure + post-FX look sync
import type { PostFXContext } from '../PostFX';
import type { SkySystemContext } from '../sky/SkySystem';
import { applySkyForReveal } from '../sky/skyRevealBlend';
import { syncPostFxCohesion } from './syncPostFxCohesion';
import { syncPostFxGrade } from './syncPostFxGrade';

export interface SyncColorPipelineOptions {
  elevationDeg: number;
  sunIntensity: number;
  vignetteEnergyRatio: number;
  revealActive: boolean;
  /** Terrain-silhouette horizon elevation (deg) toward the sun — see `sunHorizonOcclusion.ts`. */
  sunHorizonElevationDeg?: number;
}

/** Single entry: atmosphere + AgX/sky exposure, cohesion weights, post grade. */
export function syncColorPipeline(
  sky: SkySystemContext,
  postFX: PostFXContext,
  options: SyncColorPipelineOptions,
): void {
  const { elevationDeg, sunIntensity, vignetteEnergyRatio, revealActive, sunHorizonElevationDeg } =
    options;
  applySkyForReveal(sky, postFX, elevationDeg);
  syncPostFxCohesion(postFX, elevationDeg, sunIntensity, {
    vignetteEnergyRatio,
    revealActive,
    horizonElevationDeg: sunHorizonElevationDeg,
  });
  syncPostFxGrade(postFX, elevationDeg);
}
