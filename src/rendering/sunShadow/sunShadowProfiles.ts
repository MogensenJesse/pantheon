// src/rendering/sunShadow/sunShadowProfiles.ts — per-receiver shadow tunables (VISUAL.shadows.receivers)
import { VISUAL } from '../../config/visualTuning';
import { currentSunElevationDeg } from '../sunSpherical';
import { sampleTodScalar } from '../tod/todBlend';
import {
  getActiveShadowFloorStops,
  getActiveTerrainShadeSunKeep,
  type TodShadowReceiverProfile,
} from '../tod/todDevOverrides';

/** Receiver id for shadow floor lookup and debug overrides. */
export type SunShadowReceiverProfile = TodShadowReceiverProfile;

const receivers = VISUAL.shadows.receivers;

/** Noon values for initial uniform values (no elevation context yet). */
export const TERRAIN_SHADOW_FLOOR_DEFAULT = receivers.terrain.shadowFloor.noon;
export const GRASS_SHADOW_FLOOR_DEFAULT = receivers.grass.shadowFloor.noon;
export const PROP_SHADOW_FLOOR_DEFAULT = receivers.props.shadowFloor.noon;
export const WATER_SHADOW_FLOOR_DEFAULT = receivers.water.shadowFloor.noon;
export const PROP_COLOR_FLOOR_DEFAULT = receivers.props.colorFloor.noon;

export function shadowFloorForProfile(
  profile: SunShadowReceiverProfile,
  elevationDeg: number = currentSunElevationDeg(),
): number {
  return sampleTodScalar(getActiveShadowFloorStops(profile), elevationDeg);
}

/** Terrain: fraction of direct sun kept in full umbra at this elevation. */
export function terrainShadeSunKeepForElevation(
  elevationDeg: number = currentSunElevationDeg(),
): number {
  return sampleTodScalar(getActiveTerrainShadeSunKeep(), elevationDeg);
}

export function propColorFloorForElevation(
  elevationDeg: number = currentSunElevationDeg(),
): number {
  return sampleTodScalar(receivers.props.colorFloor, elevationDeg);
}
