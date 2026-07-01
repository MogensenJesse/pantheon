// src/rendering/worldLighting.ts — per-frame terrain + sun-shadow receiver sync
import type { AmbientLight, DirectionalLight, PerspectiveCamera, PointLight, Vector3 } from 'three';
import type { TerrainSplatMaterial } from '../world/terrain';
import { syncTerrainSplatLighting } from '../world/terrain';
import { syncSunShadowReceivers } from './sunShadow';

const _terrainMaterials: TerrainSplatMaterial[] = [];

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
  _terrainMaterials.length = 0;
  _terrainMaterials.push(opts.terrainMaterial);
  if (opts.terrainMacroMaterial) {
    _terrainMaterials.push(opts.terrainMacroMaterial);
  }
  syncTerrainSplatLighting(
    _terrainMaterials,
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
