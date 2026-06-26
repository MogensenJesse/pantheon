// src/rendering/sunShadow/sunShadowDebugTargets.ts — DEV shadow floor uniform bundle per receiver
import { shadowFloorForProfile, type SunShadowReceiverProfile } from './sunShadowProfiles';

export type SunShadowFloorUniform = { value: number } | { value: unknown };

export interface SunShadowDebugTargets {
  terrain?: SunShadowFloorUniform;
  /** Play-mode coarse LOD splat — mirrored when terrain floor is set. */
  terrainMacro?: SunShadowFloorUniform;
  grass?: SunShadowFloorUniform;
  props?: SunShadowFloorUniform;
  water?: SunShadowFloorUniform;
}

const RECEIVER_PROFILES = ['terrain', 'grass', 'props', 'water'] as const;

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
  if (profile === 'terrain') {
    const uniform = targets.terrain;
    if (!uniform) return false;
    uniform.value = value;
    const macro = targets.terrainMacro;
    if (macro) macro.value = value;
    return true;
  }

  const uniform = targets[profile];
  if (!uniform) return false;
  uniform.value = value;
  return true;
}

/** Restore all wired receiver floors to shipped VISUAL defaults (dev reset / shadow re-enable). */
export function restoreShadowFloorsToDefaults(targets: SunShadowDebugTargets): void {
  for (const profile of RECEIVER_PROFILES) {
    setShadowFloor(targets, profile, shadowFloorForProfile(profile));
  }
}

/**
 * When render-debug "Disable shadows" is on, force receive floors to 1 (no darkening).
 * When off, does nothing — slider values persist across frames.
 */
export function applyShadowFloorDebugOverride(
  targets: SunShadowDebugTargets,
  disableShadows: boolean,
): void {
  if (!disableShadows) return;

  for (const profile of RECEIVER_PROFILES) {
    setShadowFloor(targets, profile, 1);
  }
}

/** @deprecated Use applyShadowFloorDebugOverride */
export const applyShadowFloorDisable = applyShadowFloorDebugOverride;
