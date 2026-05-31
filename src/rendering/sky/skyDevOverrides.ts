// src/rendering/sky/skyDevOverrides.ts — DEV live sky tweaks layered on reveal blend
import { invalidateSkyRevealCache } from './skyRevealBlend';
import type { SkyRevealAtmosphere } from './skyDefaults';

const overrides: Partial<SkyRevealAtmosphere> = {};

export function setSkyDevOverride<K extends keyof SkyRevealAtmosphere>(
  key: K,
  value: SkyRevealAtmosphere[K],
): void {
  overrides[key] = value;
  invalidateSkyRevealCache();
}

export function clearSkyDevOverrides(): void {
  for (const key of Object.keys(overrides) as (keyof SkyRevealAtmosphere)[]) {
    delete overrides[key];
  }
  invalidateSkyRevealCache();
}

/** Reveal blend first, then per-slider DEV overrides (main loop applies every frame). */
export function mergeSkyWithDevOverrides(base: SkyRevealAtmosphere): SkyRevealAtmosphere {
  return { ...base, ...overrides };
}
