// src/world/LandmarkSpawner.ts
import {
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
} from 'three';
import { cloneFromRegistry } from '../assets/AssetLoader';
import type { AssetRegistry } from '../assets/assetManifest';
import { WORLD } from './WorldConfig';
import type { TerrainContext } from './TerrainGenerator';

const STONE_SCALES = [1.0, 1.2, 1.35, 1.55, 1.8];

export interface LandmarkContext {
  root: Group;
  stoneMeshes: Object3D[];
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

export function buildLandmarkSpawner(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
): LandmarkContext {
  const root = new Group();
  const stoneMeshes: Object3D[] = [];

  for (const stone of WORLD.LANDMARKS.stones) {
    const key = `stone_${stone.id}`;
    const model = cloneFromRegistry(assets, key);
    const [x, z] = stone.xz;
    const mesh = placeModel(root, model, x, z, terrain, {
      scale: STONE_SCALES[stone.id],
      rotationY: (stone.id * 0.7 + 0.3) % (Math.PI * 2),
    });
    stoneMeshes.push(mesh);
  }

  const [oakX, oakZ] = WORLD.LANDMARKS.ancientOak.xz;
  placeModel(root, cloneFromRegistry(assets, 'ancient_oak'), oakX, oakZ, terrain, {
    scale: 1.5,
  });

  const [springX, springZ] = WORLD.LANDMARKS.sacredSpring.xz;
  const springDisc = new Mesh(
    new CircleGeometry(2.5, 32),
    new MeshBasicMaterial({
      color: 0x1a3a5c,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  springDisc.rotation.x = -Math.PI / 2;
  springDisc.position.set(springX, terrain.getWorldY(springX, springZ) + 0.05, springZ);
  root.add(springDisc);

  const pebbleKeys = ['pebble_1', 'pebble_2', 'pebble_3', 'pebble_4', 'pebble_5'];
  for (let i = 0; i < pebbleKeys.length; i++) {
    const angle = (i / pebbleKeys.length) * Math.PI * 2;
    const px = springX + Math.cos(angle) * 2.8;
    const pz = springZ + Math.sin(angle) * 2.8;
    placeModel(root, cloneFromRegistry(assets, pebbleKeys[i]), px, pz, terrain, {
      scale: 0.6 + (i % 3) * 0.1,
    });
  }

  const [templeX, templeZ] = WORLD.LANDMARKS.drownedTemple.xz;
  const templePieces: Array<{ key: string; ox: number; oz: number; yOff: number; rot: number; scale: number }> = [
    { key: 'temple_floor', ox: 0, oz: 0, yOff: -0.3, rot: 0, scale: 1.2 },
    { key: 'temple_wall_1', ox: -4, oz: 2, yOff: -0.5, rot: 0.4, scale: 1 },
    { key: 'temple_wall_2', ox: 4, oz: -1, yOff: -0.2, rot: -0.3, scale: 1 },
    { key: 'temple_arch', ox: 0, oz: -5, yOff: 0, rot: Math.PI, scale: 1.1 },
    { key: 'statue_fox', ox: -6, oz: -4, yOff: 0.1, rot: 0.8, scale: 0.9 },
    { key: 'statue_stag', ox: 6, oz: 4, yOff: 0.1, rot: -0.5, scale: 0.95 },
  ];
  for (const piece of templePieces) {
    placeModel(
      root,
      cloneFromRegistry(assets, piece.key),
      templeX + piece.ox,
      templeZ + piece.oz,
      terrain,
      { yOffset: piece.yOff, rotationY: piece.rot, scale: piece.scale },
    );
  }

  const [cairnX, cairnZ] = WORLD.LANDMARKS.highCairn.xz;
  const cairnOffsets = [
    { key: 'cairn_rock_1', y: 0, scale: 1.1, rot: 0.2 },
    { key: 'cairn_rock_2', y: 0.8, scale: 0.9, rot: -0.4 },
  ];
  for (const c of cairnOffsets) {
    placeModel(root, cloneFromRegistry(assets, c.key), cairnX, cairnZ, terrain, {
      yOffset: c.y,
      scale: c.scale,
      rotationY: c.rot,
    });
  }

  scene.add(root);

  root.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return { root, stoneMeshes };
}

// Mountain range along the NE peninsula land-bridge (x>0, z<0 quadrant)
const MOUNTAIN_BORDER_PLACEMENTS = [
  { key: 'mountain_group_1', x:  65, z:  -68, scale: 3.0, rotY:  0.3  },
  { key: 'mountain_group_2', x:  78, z:  -74, scale: 2.8, rotY: -0.5  },
  { key: 'mountain_large',   x:  72, z:  -55, scale: 3.5, rotY:  0.8  },
  { key: 'mountain_group_1', x:  87, z:  -82, scale: 2.5, rotY:  1.2  },
  { key: 'mountain_single',  x:  60, z:  -80, scale: 3.2, rotY: -0.2  },
  { key: 'mountain_group_2', x:  68, z:  -90, scale: 2.6, rotY:  0.6  },
  { key: 'mountain_large',   x:  88, z:  -62, scale: 3.0, rotY: -0.8  },
  { key: 'mountain_single',  x:  55, z:  -72, scale: 2.8, rotY:  1.5  },
] as const;

export function buildMountainBorder(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
): void {
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
}
