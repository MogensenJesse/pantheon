// src/rendering/sunShadow/syncSunShadowReceivers.ts — per-frame sun shadow receiver uniform sync
import { Color, type DirectionalLight, type PointLight, Vector3 } from 'three';
import { copyBakedSunDirection } from './bakedSunDirection';
import {
  grassSunReceiverUniforms,
  propSunReceiverUniforms,
  waterSunReceiverUniforms,
} from './receiverUniforms';

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

  grassSunReceiverUniforms.uSunIntensity.value = sunIntensity;
  propSunReceiverUniforms.uSunIntensity.value = sunIntensity;
  waterSunReceiverUniforms.uSunIntensity.value = sunIntensity;

  grassSunReceiverUniforms.uSunDirection.value.copy(_sunDir);
  propSunReceiverUniforms.uSunDirection.value.copy(_sunDir);
  grassSunReceiverUniforms.uSunColor.value.copy(opts.sun.color);

  if (opts.daylight !== undefined) {
    propSunReceiverUniforms.uDaylight.value = opts.daylight;
    _lastDaylight = opts.daylight;
  }
  if (opts.playerPosition) {
    propSunReceiverUniforms.uPlayerPosition.value.copy(opts.playerPosition);
    _lastPlayerPos.copy(opts.playerPosition);
  }
  if (opts.playerLight) {
    propSunReceiverUniforms.uLightRadius.value = opts.playerLight.distance;
    propSunReceiverUniforms.uLightIntensity.value = opts.playerLight.intensity;
    _lastLightRadius = opts.playerLight.distance;
    _lastLightIntensity = opts.playerLight.intensity;
  }

  _lastSunIntensity = sunIntensity;
  _lastSunDir.copy(_sunDir);
  _lastSunColor.copy(opts.sun.color);
}
