// src/rendering/sunShadow/sunShadowDebugTargets.ts — DEV shadow floor uniform bundle per receiver
import { SHADOW_RECEIVER_PROFILES } from '../tod/todDevOverrides';
import { type SunShadowReceiverProfile, shadowFloorForProfile } from './sunShadowProfiles';

type SunShadowFloorUniform = { value: unknown };

export interface SunShadowDebugTargets {
  terrain?: SunShadowFloorUniform;
  grass?: SunShadowFloorUniform;
  props?: SunShadowFloorUniform;
  water?: SunShadowFloorUniform;
}

/** Set uShadowFloor on a receiver profile; returns false when the target is missing. */
export function setShadowFloor(
  targets: SunShadowDebugTargets,
  profile: SunShadowReceiverProfile,
  value: number,
): boolean {
  const uniform = targets[profile];
  if (!uniform) return false;
  uniform.value = value;
  return true;
}

/** Re-sample every wired receiver floor at the current sun elevation (shadow re-enable / dev reset). */
export function restoreShadowFloorsToDefaults(targets: SunShadowDebugTargets): void {
  for (const profile of SHADOW_RECEIVER_PROFILES) {
    setShadowFloor(targets, profile, shadowFloorForProfile(profile));
  }
}

/** Force every receive floor to 1 (no darkening): render-debug "Disable shadows". */
export function applyShadowFloorDebugOverride(targets: SunShadowDebugTargets): void {
  for (const profile of SHADOW_RECEIVER_PROFILES) {
    setShadowFloor(targets, profile, 1);
  }
}
