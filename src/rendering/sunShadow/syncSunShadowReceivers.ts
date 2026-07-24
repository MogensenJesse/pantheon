// src/rendering/sunShadow/syncSunShadowReceivers.ts — per-frame sun shadow receiver uniform sync
import { Color, type DirectionalLight, type PointLight, Vector3 } from 'three';
import { grassSharedUniforms } from '../../world/grass/config/grassUniforms';
import { propShadowUniforms } from '../../world/mapProps/config/mapPropShadowUniforms';
import { waterShadowUniforms } from '../../world/water/material/waterShadowUniforms';
import { copyBakedSunDirection } from './bakedSunDirection';

const _sunDir = new Vector3();
const _lastSunDir = new Vector3();
const _lastSunColor = new Color();
const _lastPlayerPos = new Vector3();
let _lastSunIntensity = -1;
let _lastDaylight = Number.NaN;
let _lastLightRadius = -1;
let _lastLightIntensity = -1;

export interface SunShadowReceiverSyncOpts {
  sun: DirectionalLight;
  daylight?: number;
  playerPosition?: Vector3;
  playerLight?: PointLight;
}

/** Sync uSunIntensity (and prop player/daylight) on all manual shadow receivers. */
export function syncSunShadowReceivers(opts: SunShadowReceiverSyncOpts): void {
  const sunIntensity = opts.sun.intensity;
  copyBakedSunDirection(opts.sun, _sunDir);

  const sunChanged =
    Math.abs(_lastSunIntensity - sunIntensity) > 1e-4 ||
    _lastSunDir.distanceToSquared(_sunDir) > 1e-8 ||
    !_lastSunColor.equals(opts.sun.color);

  const daylightChanged =
    opts.daylight !== undefined && Math.abs(_lastDaylight - opts.daylight) > 1e-4;

  const playerChanged =
    opts.playerPosition !== undefined &&
    _lastPlayerPos.distanceToSquared(opts.playerPosition) > 1e-4;

  const lightChanged =
    opts.playerLight !== undefined &&
    (Math.abs(_lastLightRadius - opts.playerLight.distance) > 1e-4 ||
      Math.abs(_lastLightIntensity - opts.playerLight.intensity) > 1e-4);

  if (!sunChanged && !daylightChanged && !playerChanged && !lightChanged) {
    return;
  }

  grassSharedUniforms.uSunIntensity.value = sunIntensity;
  propShadowUniforms.uSunIntensity.value = sunIntensity;
  waterShadowUniforms.uSunIntensity.value = sunIntensity;

  grassSharedUniforms.uSunDirection.value.copy(_sunDir);
  propShadowUniforms.uSunDirection.value.copy(_sunDir);
  grassSharedUniforms.uSunColor.value.copy(opts.sun.color);

  if (opts.daylight !== undefined) {
    propShadowUniforms.uDaylight.value = opts.daylight;
    _lastDaylight = opts.daylight;
  }
  if (opts.playerPosition) {
    propShadowUniforms.uPlayerPosition.value.copy(opts.playerPosition);
    _lastPlayerPos.copy(opts.playerPosition);
  }
  if (opts.playerLight) {
    propShadowUniforms.uLightRadius.value = opts.playerLight.distance;
    propShadowUniforms.uLightIntensity.value = opts.playerLight.intensity;
    _lastLightRadius = opts.playerLight.distance;
    _lastLightIntensity = opts.playerLight.intensity;
  }

  _lastSunIntensity = sunIntensity;
  _lastSunDir.copy(_sunDir);
  _lastSunColor.copy(opts.sun.color);
}
