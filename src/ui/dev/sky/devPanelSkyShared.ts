// src/ui/dev/sky/devPanelSkyShared.ts — elevation-driven dev override helpers

import { sunRevealState } from '../../../core/reveal/WorldReveal';
import type { PostFXContext } from '../../../rendering/PostFX';
import { sampleLighting } from '../../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import type { SkyRevealAtmosphere } from '../../../rendering/sky/skyDefaults';
import { setSkyDevOverride } from '../../../rendering/sky/skyDevOverrides';
import { applySkyForReveal } from '../../../rendering/sky/skyRevealBlend';

export function elevationForPanel(): number {
  return sunRevealState.elevationDeg;
}

/** Atmosphere blend factor 0..1 for dev panel sync. */
export function atmosphereBlendTForPanel(): number {
  return sampleLighting(sunRevealState.elevationDeg).atmosphereBlendT;
}

export function pushDevSkyOverride<K extends keyof SkyRevealAtmosphere>(
  sky: SkySystemContext,
  postFX: PostFXContext,
  key: K,
  value: SkyRevealAtmosphere[K],
): void {
  setSkyDevOverride(key, value);
  applySkyForReveal(sky, postFX, elevationForPanel());
}
