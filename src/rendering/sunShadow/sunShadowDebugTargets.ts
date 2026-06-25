// src/rendering/sunShadow/sunShadowDebugTargets.ts — DEV shadow floor uniform bundle per receiver
import { shadowFloorForProfile, type SunShadowReceiverProfile } from './sunShadowProfiles';

export type SunShadowFloorUniform = { value: number } | { value: unknown };

export interface SunShadowDebugTargets {
  terrain?: SunShadowFloorUniform;
  grass?: SunShadowFloorUniform;
  props?: SunShadowFloorUniform;
  water?: SunShadowFloorUniform;
}

export function createSunShadowDebugTargets(
  floors: SunShadowDebugTargets,
): SunShadowDebugTargets {
  return floors;
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

export function applyShadowFloorDisable(
  targets: SunShadowDebugTargets,
  disableShadows: boolean,
): void {
  for (const profile of ['terrain', 'grass', 'props', 'water'] as const) {
    const uniform = targets[profile];
    if (!uniform) continue;
    uniform.value = disableShadows ? 1 : shadowFloorForProfile(profile);
  }
}
