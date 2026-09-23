// src/rendering/tod/todDevOverrides.ts — DEV live overrides for TOD-sampled scalars/colors
import type { TodStopId } from '../../config/visual/tod';
import { TOD_STOPS } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';

export type TodScalarStops = { night: number; goldenHour: number; noon: number };
export type TodShadowReceiverProfile = 'terrain' | 'grass' | 'props' | 'water';

type CloudPaletteStop = { sun: number; ambient: number; tint: number };
type CloudPaletteStops = Record<TodStopId, CloudPaletteStop>;

const _bloomSceneWeight: TodScalarStops = { ...VISUAL.bloom.sceneWeight };
let _bloomDirty = false;

const _shadowFloors: Record<TodShadowReceiverProfile, TodScalarStops> = {
  terrain: { ...VISUAL.shadows.receivers.terrain.shadowFloor },
  grass: { ...VISUAL.shadows.receivers.grass.shadowFloor },
  props: { ...VISUAL.shadows.receivers.props.shadowFloor },
  water: { ...VISUAL.shadows.receivers.water.shadowFloor },
};
let _shadowDirty = false;

const SHADOW_PROFILES = Object.keys(_shadowFloors) as TodShadowReceiverProfile[];

const _cloudPalette: CloudPaletteStops = {
  night: { ...VISUAL.clouds.palette.night },
  goldenHour: { ...VISUAL.clouds.palette.goldenHour },
  noon: { ...VISUAL.clouds.palette.noon },
};
let _cloudDirty = false;

function cloneStops(src: TodScalarStops): TodScalarStops {
  return { night: src.night, goldenHour: src.goldenHour, noon: src.noon };
}

/** Active bloom composite add weights (VISUAL + DEV edits). */
export function getActiveBloomSceneWeight(): TodScalarStops {
  return _bloomDirty ? _bloomSceneWeight : VISUAL.bloom.sceneWeight;
}

export function setBloomSceneWeightStop(stop: TodStopId, value: number): void {
  if (!_bloomDirty) {
    Object.assign(_bloomSceneWeight, VISUAL.bloom.sceneWeight);
    _bloomDirty = true;
  }
  _bloomSceneWeight[stop] = value;
}

export function resetBloomSceneWeightDevOverride(): void {
  Object.assign(_bloomSceneWeight, VISUAL.bloom.sceneWeight);
  _bloomDirty = false;
}

export function getActiveShadowFloorStops(profile: TodShadowReceiverProfile): TodScalarStops {
  return _shadowDirty ? _shadowFloors[profile] : VISUAL.shadows.receivers[profile].shadowFloor;
}

export function setShadowFloorStop(
  profile: TodShadowReceiverProfile,
  stop: TodStopId,
  value: number,
): void {
  if (!_shadowDirty) {
    for (const p of SHADOW_PROFILES) {
      Object.assign(_shadowFloors[p], VISUAL.shadows.receivers[p].shadowFloor);
    }
    _shadowDirty = true;
  }
  _shadowFloors[profile][stop] = value;
}

export function resetShadowFloorDevOverrides(): void {
  for (const p of SHADOW_PROFILES) {
    Object.assign(_shadowFloors[p], VISUAL.shadows.receivers[p].shadowFloor);
  }
  _shadowDirty = false;
}

export function getActiveCloudPalette(): CloudPaletteStops {
  return _cloudDirty ? _cloudPalette : VISUAL.clouds.palette;
}

export function setCloudPaletteStopColor(
  stop: TodStopId,
  channel: keyof CloudPaletteStop,
  hexOrInt: number,
): void {
  if (!_cloudDirty) {
    for (const s of TOD_STOPS) {
      Object.assign(_cloudPalette[s], VISUAL.clouds.palette[s]);
    }
    _cloudDirty = true;
  }
  _cloudPalette[stop][channel] = hexOrInt;
}

export function resetCloudPaletteDevOverride(): void {
  for (const s of TOD_STOPS) {
    Object.assign(_cloudPalette[s], VISUAL.clouds.palette[s]);
  }
  _cloudDirty = false;
}

/** Snapshot helpers for panel sync. */
export function readBloomSceneWeightStop(stop: TodStopId): number {
  return getActiveBloomSceneWeight()[stop];
}

export function readShadowFloorStop(profile: TodShadowReceiverProfile, stop: TodStopId): number {
  return getActiveShadowFloorStops(profile)[stop];
}

export function cloneActiveBloomWeights(): TodScalarStops {
  return cloneStops(getActiveBloomSceneWeight());
}
