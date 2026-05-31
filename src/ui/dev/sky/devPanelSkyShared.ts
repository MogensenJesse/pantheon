// src/ui/dev/sky/devPanelSkyShared.ts — reveal progress + dev override helpers
import { setSkyDevOverride } from '../../../rendering/sky/skyDevOverrides';
import { applySkyForReveal } from '../../../rendering/sky/skyRevealBlend';
import type { SkyRevealAtmosphere } from '../../../rendering/sky/skyDefaults';
import { getSunRevealProgress, isSunRevealDone } from '../../../core/reveal/WorldReveal';
import type { PostFXContext } from '../../../rendering/PostFX';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';

export function revealTForPanel(): number {
  const t = getSunRevealProgress();
  if (t !== null) return t;
  return isSunRevealDone() ? 1 : 0;
}

export function pushDevSkyOverride<K extends keyof SkyRevealAtmosphere>(
  sky: SkySystemContext,
  postFX: PostFXContext,
  key: K,
  value: SkyRevealAtmosphere[K],
): void {
  setSkyDevOverride(key, value);
  applySkyForReveal(sky, postFX, revealTForPanel());
}
