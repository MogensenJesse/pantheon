// src/rendering/sunShadow/sunShadowProfiles.ts — per-receiver shadow tunables (VISUAL.shadows.receivers)
import { VISUAL } from '../../config/visualTuning';
import { sampleTodScalar } from '../tod/todBlend';
import { getActiveShadowFloorStops } from '../tod/todDevOverrides';
import { currentSunElevationDeg } from '../sunSpherical';

/** Receiver id for shadow floor lookup and debug overrides. */
export type SunShadowReceiverProfile = 'terrain' | 'grass' | 'props' | 'water';

const receivers = VISUAL.shadows.receivers;

export type TodScalarStops = { night: number; goldenHour: number; noon: number };

/** Noon defaults for uniform init / DEV reset when no elevation context. */
export const TERRAIN_SHADOW_FLOOR_DEFAULT = receivers.terrain.shadowFloor.noon;
export const GRASS_SHADOW_FLOOR_DEFAULT = receivers.grass.shadowFloor.noon;
export const PROP_SHADOW_FLOOR_DEFAULT = receivers.props.shadowFloor.noon;
export const WATER_SHADOW_FLOOR_DEFAULT = receivers.water.shadowFloor.noon;
export const PROP_COLOR_FLOOR_DEFAULT = receivers.props.colorFloor.noon;

export function shadowFloorStopsForProfile(profile: SunShadowReceiverProfile): TodScalarStops {
  return getActiveShadowFloorStops(profile);
}

export function shadowFloorForProfile(
  profile: SunShadowReceiverProfile,
  elevationDeg: number = currentSunElevationDeg(),
): number {
  return sampleTodScalar(getActiveShadowFloorStops(profile), elevationDeg);
}

export function propColorFloorForElevation(
  elevationDeg: number = currentSunElevationDeg(),
): number {
  return sampleTodScalar(receivers.props.colorFloor, elevationDeg);
}
