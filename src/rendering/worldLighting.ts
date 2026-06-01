// src/rendering/worldLighting.ts — per-frame terrain + grass lighting sync
import type { AmbientLight, DirectionalLight, PerspectiveCamera, PointLight, Vector3 } from 'three';
import { syncGrassLighting } from '../world/grass/grassMaterial';
import { syncTerrainSplatLighting } from '../world/terrain';
import type { TerrainSplatMaterial } from '../world/terrain/TerrainSplatMaterial';

export function syncWorldLighting(opts: {
  terrainMaterial: TerrainSplatMaterial;
  playerPosition: Vector3;
  playerLight: PointLight;
  sun: DirectionalLight;
  ambientLight: AmbientLight;
  camera: PerspectiveCamera;
}): void {
  syncTerrainSplatLighting(
    opts.terrainMaterial,
    opts.playerPosition,
    opts.playerLight,
    opts.sun,
    opts.ambientLight,
    opts.camera,
  );
  syncGrassLighting(opts.playerPosition, opts.playerLight, opts.sun, opts.camera);
}
