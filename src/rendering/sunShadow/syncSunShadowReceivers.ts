// src/rendering/sunShadow/syncSunShadowReceivers.ts — per-frame sun shadow receiver uniform sync
import { Color, type DirectionalLight, type PointLight, Vector3 } from 'three';
import { currentSunElevationDeg } from '../sunSpherical';
import { sampleTodLightPalette, todLightPaletteVersion } from '../tod/todLightPalette';
import { copyBakedSunDirection } from './bakedSunDirection';
import {
  foliageTintUniforms,
  grassSunReceiverUniforms,
  propSunReceiverUniforms,
  waterSunReceiverUniforms,
} from './receiverUniforms';
import { propColorFloorForElevation, shadowFloorForProfile } from './sunShadowProfiles';

const _sunDir = new Vector3();
const _lastSunDir = new Vector3();
const _lastSunColor = new Color();
const _lastPlayerPos = new Vector3();
let _lastSunIntensity = -1;
let _lastDaylight = Number.NaN;
let _lastLightRadius = -1;
let _lastLightIntensity = -1;
let _lastElevationDeg = Number.NaN;
let _lastGrassFloor = Number.NaN;
let _lastPropFloor = Number.NaN;
let _lastWaterFloor = Number.NaN;
let _lastPropColorFloor = Number.NaN;
let _lastPaletteVersion = -1;

interface SunShadowReceiverSyncOpts {
  sun: DirectionalLight;
  daylight?: number;
  playerPosition?: Vector3;
  playerLight?: PointLight;
}

/** Sync sun intensity/direction, ToD floors and tints, and prop player/daylight on the manual receivers. */
export function syncSunShadowReceivers(opts: SunShadowReceiverSyncOpts): void {
  const sunIntensity = opts.sun.intensity;
  copyBakedSunDirection(opts.sun, _sunDir);
  const elev = currentSunElevationDeg();

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

  const elevChanged = Math.abs(_lastElevationDeg - elev) > 1e-4;
  const paletteVersion = todLightPaletteVersion();

  // Floors follow ToD stop overrides — re-sample whenever the blended value changes,
  // not only when elevation moves (scrub-locked ToD edits).
  const grassFloor = shadowFloorForProfile('grass', elev);
  const propFloor = shadowFloorForProfile('props', elev);
  const waterFloor = shadowFloorForProfile('water', elev);
  const propColorFloor = propColorFloorForElevation(elev);
  const floorsChanged =
    Math.abs(grassFloor - _lastGrassFloor) > 1e-5 ||
    Math.abs(propFloor - _lastPropFloor) > 1e-5 ||
    Math.abs(waterFloor - _lastWaterFloor) > 1e-5 ||
    Math.abs(propColorFloor - _lastPropColorFloor) > 1e-5 ||
    Number.isNaN(_lastGrassFloor);

  if (
    !sunChanged &&
    !daylightChanged &&
    !playerChanged &&
    !lightChanged &&
    !elevChanged &&
    !floorsChanged &&
    paletteVersion === _lastPaletteVersion
  ) {
    return;
  }

  const palette = sampleTodLightPalette(elev);
  foliageTintUniforms.uSkyTint.value.copy(palette.foliageSky);
  foliageTintUniforms.uGroundTint.value.copy(palette.foliageGround);
  propSunReceiverUniforms.uSunTint.value.copy(palette.sunTint);
  propSunReceiverUniforms.uAmbientTint.value.copy(palette.ambientTint);
  _lastPaletteVersion = paletteVersion;

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

  if (floorsChanged) {
    if (Math.abs(grassFloor - _lastGrassFloor) > 1e-5 || Number.isNaN(_lastGrassFloor)) {
      grassSunReceiverUniforms.uShadowFloor.value = grassFloor;
      _lastGrassFloor = grassFloor;
    }
    if (Math.abs(propFloor - _lastPropFloor) > 1e-5 || Number.isNaN(_lastPropFloor)) {
      propSunReceiverUniforms.uShadowFloor.value = propFloor;
      _lastPropFloor = propFloor;
    }
    if (Math.abs(waterFloor - _lastWaterFloor) > 1e-5 || Number.isNaN(_lastWaterFloor)) {
      waterSunReceiverUniforms.uShadowFloor.value = waterFloor;
      _lastWaterFloor = waterFloor;
    }
    if (
      Math.abs(propColorFloor - _lastPropColorFloor) > 1e-5 ||
      Number.isNaN(_lastPropColorFloor)
    ) {
      propSunReceiverUniforms.uNightColorFloor.value = propColorFloor;
      _lastPropColorFloor = propColorFloor;
    }
  }

  _lastElevationDeg = elev;
  _lastSunIntensity = sunIntensity;
  _lastSunDir.copy(_sunDir);
  _lastSunColor.copy(opts.sun.color);
}
