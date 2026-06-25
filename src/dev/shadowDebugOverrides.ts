// src/dev/shadowDebugOverrides.ts — dev shadow disable without tearing down shadow maps
import type { DirectionalLight } from 'three';
import { GRASS_SHADOW_FLOOR_DEFAULT, type GrassShadowUniforms } from '../world/grass/config/grassUniforms';
import {
  PROP_SHADOW_FLOOR_DEFAULT,
  type PropShadowUniforms,
} from '../world/mapProps/mapPropShadowUniforms';
import {
  TERRAIN_SHADOW_FLOOR_DEFAULT,
  type TerrainSplatUniforms,
} from '../world/terrain/material/biomeSplatUniforms';
import { WATER_SHADOW_FLOOR_DEFAULT, type WaterShadowUniforms } from '../world/water/waterShadowUniforms';

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
    terrainUniforms.uShadowFloor.value = disableShadows ? 1 : TERRAIN_SHADOW_FLOOR_DEFAULT;
  }
  if (grassShadowUniforms) {
    grassShadowUniforms.uShadowFloor.value = disableShadows ? 1 : GRASS_SHADOW_FLOOR_DEFAULT;
  }
  if (propShadowUniforms) {
    propShadowUniforms.uShadowFloor.value = disableShadows ? 1 : PROP_SHADOW_FLOOR_DEFAULT;
  }
  if (waterShadowUniforms) {
    waterShadowUniforms.uShadowFloor.value = disableShadows ? 1 : WATER_SHADOW_FLOOR_DEFAULT;
  }
}
