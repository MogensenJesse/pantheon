// src/rendering/worldLighting.ts — per-frame terrain + sun-shadow receiver sync
import type { AmbientLight, DirectionalLight, PerspectiveCamera, PointLight, Vector3 } from 'three';
import { syncTerrainSplatLighting } from '../world/terrain';
import type { TerrainSplatMaterial } from '../world/terrain';
import { syncSunShadowReceivers } from './sunShadow';

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
  syncSunShadowReceivers({
    sun: opts.sun,
    daylight: opts.daylight,
    playerPosition: opts.playerPosition,
    playerLight: opts.playerLight,
  });
}
