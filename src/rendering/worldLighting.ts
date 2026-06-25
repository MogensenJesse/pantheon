// src/rendering/worldLighting.ts — per-frame terrain + sun-shadow receiver sync
import type { AmbientLight, DirectionalLight, PerspectiveCamera, PointLight, Vector3 } from 'three';
import { propShadowUniforms } from '../world/mapProps/mapPropShadowUniforms';
import { syncTerrainSplatLighting } from '../world/terrain';
import type { TerrainSplatMaterial } from '../world/terrain';
import { waterShadowUniforms } from '../world/water/waterShadowUniforms';

export function syncWorldLighting(opts: {
  terrainMaterial: TerrainSplatMaterial;
  terrainMacroMaterial?: TerrainSplatMaterial;
  playerPosition: Vector3;
  playerLight: PointLight;
  sun: DirectionalLight;
  ambientLight: AmbientLight;
  camera: PerspectiveCamera;
  daylight?: number;
}): void {
  const materials = opts.terrainMacroMaterial
    ? [opts.terrainMaterial, opts.terrainMacroMaterial]
    : opts.terrainMaterial;
  syncTerrainSplatLighting(
    materials,
    opts.playerPosition,
    opts.playerLight,
    opts.sun,
    opts.ambientLight,
    opts.camera,
  );
  propShadowUniforms.uSunIntensity.value = opts.sun.intensity;
  if (opts.daylight !== undefined) {
    propShadowUniforms.uDaylight.value = opts.daylight;
  }
  propShadowUniforms.uPlayerPosition.value.copy(opts.playerPosition);
  propShadowUniforms.uLightRadius.value = opts.playerLight.distance;
  propShadowUniforms.uLightIntensity.value = opts.playerLight.intensity;
  waterShadowUniforms.uSunIntensity.value = opts.sun.intensity;
}
