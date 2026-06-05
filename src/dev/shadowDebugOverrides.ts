// src/dev/shadowDebugOverrides.ts — dev shadow disable without tearing down shadow maps
import type { DirectionalLight } from 'three';
import type { GrassShadowUniforms } from '../world/grass/grassUniforms';
import {
  TERRAIN_SHADOW_FLOOR_DEFAULT,
  type TerrainSplatUniforms,
} from '../world/terrain/biomeSplatUniforms';

/** Default Three.js sun shadow contribution on receiveShadow meshes. */
const SUN_SHADOW_INTENSITY_DEFAULT = 1;

/**
 * Disable shadow *contribution* while keeping castShadow and the depth map alive.
 * GodraysNode and terrain shadow(sun) require a valid sun.shadow.map on WebGPU.
 */
export function applyShadowDebugOverrides(
  sun: DirectionalLight,
  terrainUniforms: TerrainSplatUniforms | undefined,
  grassShadowUniforms: GrassShadowUniforms | undefined,
  disableShadows: boolean,
): void {
  sun.shadow.intensity = disableShadows ? 0 : SUN_SHADOW_INTENSITY_DEFAULT;
  const shadowFloor = disableShadows ? 1 : TERRAIN_SHADOW_FLOOR_DEFAULT;
  if (terrainUniforms) {
    terrainUniforms.uShadowFloor.value = shadowFloor;
  }
  if (grassShadowUniforms) {
    grassShadowUniforms.uShadowFloor.value = shadowFloor;
  }
}
