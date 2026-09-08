// src/rendering/sky/skyDevOverrides.ts — DEV live sky tweaks layered on reveal blend

import {
  SKY_GOLDEN,
  SKY_NIGHT,
  SKY_NOON,
  type SkyAtmosphereScalars,
  type SkyAtmosphereStop,
  type SkyRevealAtmosphere,
} from './skyDefaults';
import { invalidateSkyRevealCache } from './skyRevealBlend';

export type SkyAtmosphereStopId = 'night' | 'goldenHour' | 'noon';

const STOP_BASE: Record<SkyAtmosphereStopId, SkyAtmosphereStop> = {
  night: SKY_NIGHT,
  goldenHour: SKY_GOLDEN,
  noon: SKY_NOON,
};

const stopOverrides: Record<SkyAtmosphereStopId, Partial<SkyAtmosphereStop>> = {
  night: {},
  goldenHour: {},
  noon: {},
};

/** Live overrides for non-stop params (SkyMesh clouds, sun disc). */
const liveOverrides: Partial<SkyRevealAtmosphere> = {};

export function setSkyAtmosphereStopOverride(
  stop: SkyAtmosphereStopId,
  key: keyof SkyAtmosphereScalars,
  value: number,
): void {
  stopOverrides[stop][key] = value;
  invalidateSkyRevealCache();
}

export function setSkyAtmosphereStopTint(stop: SkyAtmosphereStopId, hex: string): void {
  stopOverrides[stop].tint = hex;
  invalidateSkyRevealCache();
}

export function getActiveSkyAtmosphereStop(stop: SkyAtmosphereStopId): SkyAtmosphereStop {
  return { ...STOP_BASE[stop], ...stopOverrides[stop] };
}

export function getActiveSkyAtmosphereStops(): Record<SkyAtmosphereStopId, SkyAtmosphereStop> {
  return {
    night: getActiveSkyAtmosphereStop('night'),
    goldenHour: getActiveSkyAtmosphereStop('goldenHour'),
    noon: getActiveSkyAtmosphereStop('noon'),
  };
}

export function setSkyDevOverride<K extends keyof SkyRevealAtmosphere>(
  key: K,
  value: SkyRevealAtmosphere[K],
): void {
  liveOverrides[key] = value;
  invalidateSkyRevealCache();
}

export function clearSkyDevOverrides(): void {
  for (const stop of Object.keys(stopOverrides) as SkyAtmosphereStopId[]) {
    for (const key of Object.keys(stopOverrides[stop]) as (keyof SkyAtmosphereStop)[]) {
      delete stopOverrides[stop][key];
    }
  }
  for (const key of Object.keys(liveOverrides) as (keyof SkyRevealAtmosphere)[]) {
    delete liveOverrides[key];
  }
  invalidateSkyRevealCache();
}

/** Reveal blend first, then per-slider DEV overrides (main loop applies every frame). */
export function mergeSkyWithDevOverrides(base: SkyRevealAtmosphere): SkyRevealAtmosphere {
  return { ...base, ...liveOverrides };
}
