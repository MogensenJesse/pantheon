// src/dev/runtime/shadowDebugOverrides.ts — dev shadow disable without tearing down shadow maps
import type { DirectionalLight } from 'three';
import {
  applyShadowFloorDebugOverride,
  restoreShadowFloorsToDefaults,
  type SunShadowDebugTargets,
} from '../../rendering/sunShadow';

/** Default Three.js sun shadow contribution on receiveShadow meshes. */
const SUN_SHADOW_INTENSITY_DEFAULT = 1;

let lastDisableShadows: boolean | undefined;

/**
 * Disable shadow *contribution* while keeping castShadow and the depth map alive.
 * GodraysNode and terrain shadow(sun) require a valid sun.shadow.map on WebGPU.
 */
export function applyShadowDebugOverrides(
  sun: DirectionalLight,
  shadowTargets: SunShadowDebugTargets | undefined,
  disableShadows: boolean,
): void {
  sun.shadow.intensity = disableShadows ? 0 : SUN_SHADOW_INTENSITY_DEFAULT;

  if (shadowTargets) {
    if (disableShadows) {
      applyShadowFloorDebugOverride(shadowTargets, true);
    } else if (lastDisableShadows === true) {
      restoreShadowFloorsToDefaults(shadowTargets);
    }
  }

  lastDisableShadows = disableShadows;
}
