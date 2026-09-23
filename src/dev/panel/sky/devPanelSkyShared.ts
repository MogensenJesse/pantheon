// src/dev/panel/sky/devPanelSkyShared.ts — elevation-driven dev override helpers

import { sunRevealState } from '../../../core/reveal/sunRevealState';
import type { PostFXContext } from '../../../rendering/PostFX';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import type { SkyAtmosphereScalars, SkyRevealAtmosphere } from '../../../rendering/sky/skyDefaults';
import {
  type SkyAtmosphereStopId,
  setSkyAtmosphereStopOverride,
  setSkyAtmosphereStopTint,
  setSkyDevOverride,
} from '../../../rendering/sky/skyDevOverrides';
import { applySkyForReveal } from '../../../rendering/sky/skyRevealBlend';

export function elevationForPanel(): number {
  return sunRevealState.elevationDeg;
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

export function pushDevSkyAtmosphereStopOverride(
  sky: SkySystemContext,
  postFX: PostFXContext,
  stop: SkyAtmosphereStopId,
  key: keyof SkyAtmosphereScalars,
  value: number,
): void {
  setSkyAtmosphereStopOverride(stop, key, value);
  applySkyForReveal(sky, postFX, elevationForPanel());
}

export function pushDevSkyAtmosphereStopTint(
  sky: SkySystemContext,
  postFX: PostFXContext,
  stop: SkyAtmosphereStopId,
  hex: string,
): void {
  setSkyAtmosphereStopTint(stop, hex);
  applySkyForReveal(sky, postFX, elevationForPanel());
}
