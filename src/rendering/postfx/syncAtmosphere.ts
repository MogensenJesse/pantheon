// src/rendering/postfx/syncAtmosphere.ts — per-frame sky, post-FX look, and valley-fog sync
import { setValleyFogFromSun } from '../atmosphere';
import type { PostFXContext } from '../PostFX';
import type { SkySystemContext } from '../sky/SkySystem';
import { applySkyForReveal } from '../sky/skyRevealBlend';
import { samplePostFxGrade } from './postfxGrade';

export interface SyncAtmosphereOptions {
  elevationDeg: number;
  sunIntensity: number;
}

/** Single play-tick entry: AgX/sky exposure, bloom/god-ray weights, grade, valley fog. */
export function syncAtmosphere(
  sky: SkySystemContext,
  postFX: PostFXContext,
  options: SyncAtmosphereOptions,
): void {
  const { elevationDeg, sunIntensity } = options;
  applySkyForReveal(sky, postFX, elevationDeg);
  postFX.setBloomSkyReduceFromSun(elevationDeg);
  postFX.setGodraysFromSun(sunIntensity, elevationDeg);
  postFX.setGradeScalars(samplePostFxGrade(elevationDeg));
  setValleyFogFromSun(elevationDeg);
}
