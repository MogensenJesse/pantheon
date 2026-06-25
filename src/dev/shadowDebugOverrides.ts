// src/dev/shadowDebugOverrides.ts — dev shadow disable without tearing down shadow maps
import type { DirectionalLight } from 'three';
import { shadowFloorForProfile } from '../rendering/sunShadow';
import type { GrassShadowUniforms } from '../world/grass/config/grassUniforms';
import type { PropShadowUniforms } from '../world/mapProps/mapPropShadowUniforms';
import type { TerrainSplatUniforms } from '../world/terrain/material/biomeSplatUniforms';
import type { WaterShadowUniforms } from '../world/water/waterShadowUniforms';

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
  propShadowUniforms: PropShadowUniforms | undefined,
  waterShadowUniforms: WaterShadowUniforms | undefined,
  disableShadows: boolean,
): void {
  sun.shadow.intensity = disableShadows ? 0 : SUN_SHADOW_INTENSITY_DEFAULT;
  if (terrainUniforms) {
    terrainUniforms.uShadowFloor.value = disableShadows ? 1 : shadowFloorForProfile('terrain');
  }
  if (grassShadowUniforms) {
    grassShadowUniforms.uShadowFloor.value = disableShadows ? 1 : shadowFloorForProfile('grass');
  }
  if (propShadowUniforms) {
    propShadowUniforms.uShadowFloor.value = disableShadows ? 1 : shadowFloorForProfile('props');
  }
  if (waterShadowUniforms) {
    waterShadowUniforms.uShadowFloor.value = disableShadows ? 1 : shadowFloorForProfile('water');
  }
}
