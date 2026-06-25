// src/rendering/sunShadow/sunShadowProfiles.ts — per-receiver shadow tunables (VISUAL.shadows.receivers)
import { VISUAL } from '../../config/visualTuning';

/** Receiver id for shadow floor lookup and debug overrides. */
export type SunShadowReceiverProfile = 'terrain' | 'grass' | 'props' | 'water';

const receivers = VISUAL.shadows.receivers;

export const TERRAIN_SHADOW_FLOOR_DEFAULT = receivers.terrain.shadowFloor;
export const GRASS_SHADOW_FLOOR_DEFAULT = receivers.grass.shadowFloor;
export const PROP_SHADOW_FLOOR_DEFAULT = receivers.props.shadowFloor;
export const WATER_SHADOW_FLOOR_DEFAULT = receivers.water.shadowFloor;

export function shadowFloorForProfile(profile: SunShadowReceiverProfile): number {
  return receivers[profile].shadowFloor;
}
