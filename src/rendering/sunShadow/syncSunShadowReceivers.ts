// src/rendering/sunShadow/syncSunShadowReceivers.ts — per-frame sun shadow receiver uniform sync
import type { DirectionalLight, PointLight, Vector3 } from 'three';
import { grassSharedUniforms } from '../../world/grass/config/grassUniforms';
import { propShadowUniforms } from '../../world/mapProps/mapPropShadowUniforms';
import { waterShadowUniforms } from '../../world/water/waterShadowUniforms';

export interface SunShadowReceiverSyncOpts {
  sun: DirectionalLight;
  daylight?: number;
  playerPosition?: Vector3;
  playerLight?: PointLight;
}

/** Sync uSunIntensity (and prop player/daylight) on all manual shadow receivers. */
export function syncSunShadowReceivers(opts: SunShadowReceiverSyncOpts): void {
  const sunIntensity = opts.sun.intensity;
  grassSharedUniforms.uSunIntensity.value = sunIntensity;
  propShadowUniforms.uSunIntensity.value = sunIntensity;
  waterShadowUniforms.uSunIntensity.value = sunIntensity;

  if (opts.daylight !== undefined) {
    propShadowUniforms.uDaylight.value = opts.daylight;
  }
  if (opts.playerPosition) {
    propShadowUniforms.uPlayerPosition.value.copy(opts.playerPosition);
  }
  if (opts.playerLight) {
    propShadowUniforms.uLightRadius.value = opts.playerLight.distance;
    propShadowUniforms.uLightIntensity.value = opts.playerLight.intensity;
  }
}
