// src/rendering/worldLighting.ts — per-frame terrain + sun-shadow receiver sync
import type { AmbientLight, DirectionalLight, PointLight, Vector3 } from 'three';
import type { TerrainSplatMaterial } from '../world/terrain';
import { syncTerrainSplatLighting } from '../world/terrain';
import { syncSunShadowReceivers } from './sunShadow';

export function syncWorldLighting(opts: {
  terrainMaterial: TerrainSplatMaterial;
  playerPosition: Vector3;
  playerLight: PointLight;
  sun: DirectionalLight;
  ambientLight: AmbientLight;
  daylight?: number;
}): void {
  syncTerrainSplatLighting(
    opts.terrainMaterial,
    opts.playerPosition,
    opts.playerLight,
    opts.sun,
    opts.ambientLight,
  );
  syncSunShadowReceivers({
    sun: opts.sun,
    daylight: opts.daylight,
    playerPosition: opts.playerPosition,
    playerLight: opts.playerLight,
  });
}
