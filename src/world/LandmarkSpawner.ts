// src/world/LandmarkSpawner.ts
import {
  type BufferGeometry,
  Group,
  type Material,
  Mesh,
  type Object3D,
  type Scene,
} from 'three';
import { cloneFromRegistry } from '../assets/AssetLoader';
import type { AssetRegistry } from '../assets/assetManifest';
import type { MapLandmarkKind } from '../map/MapTypes';
import type { TerrainContext } from './TerrainGenerator';
import { WORLD } from './WorldConfig';

export const STONE_SCALES = [1.0, 1.2, 1.35, 1.55, 1.8];

/** Recursively dispose mesh geometries + materials under a root. */
function disposeRoot(root: Object3D, scene: Scene): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    (mesh.geometry as BufferGeometry | undefined)?.dispose?.();
    const mat = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) {
      for (const m of mat) m?.dispose?.();
    } else {
      mat?.dispose?.();
    }
  });
  scene.remove(root);
}

export interface LandmarkContext {
  root: Group;
  stoneMeshes: Object3D[];
  dispose: () => void;
}

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

export function buildLandmarkSpawner(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
): LandmarkContext {
  const root = new Group();
  const stoneMeshes: Object3D[] = [];

  for (const stone of WORLD.LANDMARKS.stones) {
    const [x, z] = stone.xz;
    const mesh = spawnStandingStone(root, assets, terrain, stone.id, x, z, {
      scale: STONE_SCALES[stone.id],
      rotationY: (stone.id * 0.7 + 0.3) % (Math.PI * 2),
    });
    stoneMeshes.push(mesh);
  }

  const [oakX, oakZ] = WORLD.LANDMARKS.ancientOak.xz;
  spawnLandmarkAt(root, assets, terrain, 'ancientOak', oakX, oakZ);

  const [springX, springZ] = WORLD.LANDMARKS.sacredSpring.xz;
  spawnLandmarkAt(root, assets, terrain, 'sacredSpring', springX, springZ);

  const [templeX, templeZ] = WORLD.LANDMARKS.drownedTemple.xz;
  spawnLandmarkAt(root, assets, terrain, 'drownedTemple', templeX, templeZ);

  const [cairnX, cairnZ] = WORLD.LANDMARKS.highCairn.xz;
  spawnLandmarkAt(root, assets, terrain, 'highCairn', cairnX, cairnZ);

  scene.add(root);

  root.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return {
    root,
    stoneMeshes,
    dispose: () => disposeRoot(root, scene),
  };
}

// Mountain range along the NE peninsula land-bridge (x>0, z<0 quadrant)
export const MOUNTAIN_BORDER_PLACEMENTS = [
  { key: 'mountain_group_1', x: 65, z: -68, scale: 3.0, rotY: 0.3 },
  { key: 'mountain_group_2', x: 78, z: -74, scale: 2.8, rotY: -0.5 },
  { key: 'mountain_large', x: 72, z: -55, scale: 3.5, rotY: 0.8 },
  { key: 'mountain_group_1', x: 87, z: -82, scale: 2.5, rotY: 1.2 },
  { key: 'mountain_single', x: 60, z: -80, scale: 3.2, rotY: -0.2 },
  { key: 'mountain_group_2', x: 68, z: -90, scale: 2.6, rotY: 0.6 },
  { key: 'mountain_large', x: 88, z: -62, scale: 3.0, rotY: -0.8 },
  { key: 'mountain_single', x: 55, z: -72, scale: 2.8, rotY: 1.5 },
] as const;

export interface MountainBorderContext {
  root: Group;
  dispose: () => void;
}

export function buildMountainBorder(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
): MountainBorderContext {
  const root = new Group();
  for (const p of MOUNTAIN_BORDER_PLACEMENTS) {
    placeModel(root, cloneFromRegistry(assets, p.key), p.x, p.z, terrain, {
      scale: p.scale,
      rotationY: p.rotY,
    });
  }
  root.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  scene.add(root);
  return {
    root,
    dispose: () => disposeRoot(root, scene),
  };
}
