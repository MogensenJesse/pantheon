// src/dev/shadowDebugOverrides.ts — dev shadow disable without tearing down shadow maps
import type { DirectionalLight } from 'three';
import {
  applyShadowFloorDisable,
  type SunShadowDebugTargets,
} from '../rendering/sunShadow';

/** Default Three.js sun shadow contribution on receiveShadow meshes. */
const SUN_SHADOW_INTENSITY_DEFAULT = 1;

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
    applyShadowFloorDisable(shadowTargets, disableShadows);
  }
}
