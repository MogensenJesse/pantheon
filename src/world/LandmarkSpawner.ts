// src/world/LandmarkSpawner.ts
import type { Group, Object3D } from 'three';
import { cloneFromRegistry } from '../assets/AssetLoader';
import type { AssetRegistry } from '../assets/assetManifest';
import type { MapLandmarkKind } from '../map/MapTypes';
import type { TerrainContext } from './TerrainGenerator';

export const STONE_SCALES = [1.0, 1.2, 1.35, 1.55, 1.8];

function placeModel(
  parent: Group,
  model: Object3D,
  x: number,
  z: number,
  terrain: TerrainContext,
  opts: { yOffset?: number; scale?: number; rotationY?: number } = {},
): Object3D {
  const clone = model.clone(true);
  const y = terrain.getWorldY(x, z) + (opts.yOffset ?? 0);
  clone.position.set(x, y, z);
  if (opts.scale) clone.scale.setScalar(opts.scale);
  if (opts.rotationY) clone.rotation.y = opts.rotationY;
  parent.add(clone);
  return clone;
}

export function spawnStandingStone(
  parent: Group,
  assets: AssetRegistry,
  terrain: TerrainContext,
  stoneId: number,
  x: number,
  z: number,
  opts: { scale?: number; rotationY?: number } = {},
): Object3D {
  const key = `stone_${stoneId}`;
  const model = cloneFromRegistry(assets, key);
  return placeModel(parent, model, x, z, terrain, {
    scale: opts.scale ?? STONE_SCALES[stoneId] ?? 1,
    rotationY: opts.rotationY ?? (stoneId * 0.7 + 0.3) % (Math.PI * 2),
  });
}

export function spawnLandmarkAt(
  parent: Group,
  assets: AssetRegistry,
  terrain: TerrainContext,
  kind: MapLandmarkKind,
  x: number,
  z: number,
  opts: { scale?: number; rotationY?: number } = {},
): void {
  switch (kind) {
    case 'ancientOak':
      placeModel(parent, cloneFromRegistry(assets, 'ancient_oak'), x, z, terrain, {
        scale: opts.scale ?? 1.5,
        rotationY: opts.rotationY,
      });
      break;
    case 'sacredSpring': {
      const pebbleKeys = ['pebble_1', 'pebble_2', 'pebble_3', 'pebble_4', 'pebble_5'];
      for (let i = 0; i < pebbleKeys.length; i++) {
        const angle = (i / pebbleKeys.length) * Math.PI * 2;
        const px = x + Math.cos(angle) * 2.8;
        const pz = z + Math.sin(angle) * 2.8;
        placeModel(parent, cloneFromRegistry(assets, pebbleKeys[i]), px, pz, terrain, {
          scale: 0.6 + (i % 3) * 0.1,
        });
      }
      break;
    }
    case 'drownedTemple': {
      const templePieces: Array<{
        key: string;
        ox: number;
        oz: number;
        yOff: number;
        rot: number;
        scale: number;
      }> = [
        { key: 'temple_floor', ox: 0, oz: 0, yOff: -0.3, rot: 0, scale: 1.2 },
        { key: 'temple_wall_1', ox: -4, oz: 2, yOff: -0.5, rot: 0.4, scale: 1 },
        { key: 'temple_wall_2', ox: 4, oz: -1, yOff: -0.2, rot: -0.3, scale: 1 },
        { key: 'temple_arch', ox: 0, oz: -5, yOff: 0, rot: Math.PI, scale: 1.1 },
        { key: 'statue_fox', ox: -6, oz: -4, yOff: 0.1, rot: 0.8, scale: 0.9 },
        { key: 'statue_stag', ox: 6, oz: 4, yOff: 0.1, rot: -0.5, scale: 0.95 },
      ];
      for (const piece of templePieces) {
        placeModel(
          parent,
          cloneFromRegistry(assets, piece.key),
          x + piece.ox,
          z + piece.oz,
          terrain,
          { yOffset: piece.yOff, rotationY: piece.rot, scale: piece.scale },
        );
      }
      break;
    }
    case 'highCairn': {
      const cairnOffsets = [
        { key: 'cairn_rock_1', y: 0, scale: 1.1, rot: 0.2 },
        { key: 'cairn_rock_2', y: 0.8, scale: 0.9, rot: -0.4 },
      ];
      for (const c of cairnOffsets) {
        placeModel(parent, cloneFromRegistry(assets, c.key), x, z, terrain, {
          yOffset: c.y,
          scale: c.scale,
          rotationY: c.rot,
        });
      }
      break;
    }
  }
}
