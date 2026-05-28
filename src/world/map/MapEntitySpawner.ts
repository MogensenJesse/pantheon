// src/world/map/MapEntitySpawner.ts — spawn authored props and gameplay markers from map entities
import { Group, InstancedMesh, Mesh, Object3D, Scene } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import type { MapEntity, MapFile } from '../../map/MapTypes';
import { PROP_ROCK_KEYS, PROP_TREE_KEYS } from '../scatter/propScatterConfigs';
import { buildInstancedMeshes } from '../scatter/propInstancing';
import type { Placement } from '../scatter/placementTypes';
import type { TerrainContext } from '../TerrainGenerator';
import {
  buildLandmarkSpawner,
  buildMountainBorder,
  spawnLandmarkAt,
  spawnStandingStone,
  STONE_SCALES,
} from '../LandmarkSpawner';
import { buildMapLandmarkLayout, type MapLandmarkLayout } from './mapLandmarkLayout';
import type { OrbPlacement } from '../../entities/initOrbSystemFromMap';

export interface MapEntitySpawnContext {
  propRoot: Group;
  markerRoot: Group;
  layout: MapLandmarkLayout;
  orbPlacements: OrbPlacement[];
  stoneMeshes: Object3D[];
  dispose: () => void;
}

function entityToPlacement(e: MapEntity): Placement | null {
  if (e.type !== 'prop' && e.type !== 'mountain') return null;
  return {
    x: e.x,
    z: e.z,
    yRotation: e.rotY,
    scale: e.scale,
    instanceIndex: 0,
  };
}

export function spawnMapProps(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
  entities: MapEntity[],
): { root: Group; meshes: InstancedMesh[] } {
  const root = new Group();
  root.name = 'mapProps';
  const meshes: InstancedMesh[] = [];
  const byKey = new Map<string, { placements: Placement[]; surfaceLift: number }>();

  for (const e of entities) {
    if (e.type !== 'prop' && e.type !== 'mountain') continue;
    const placement = entityToPlacement(e);
    if (!placement) continue;
    const lift = e.type === 'prop' ? (e.surfaceLift ?? 0) : 0;
    let bucket = byKey.get(e.key);
    if (!bucket) {
      bucket = { placements: [], surfaceLift: lift };
      byKey.set(e.key, bucket);
    }
    placement.instanceIndex = bucket.placements.length;
    bucket.placements.push(placement);
  }

  for (const [key, { placements, surfaceLift }] of byKey) {
    const model = assets.get(key);
    if (!model) {
      console.warn(`Missing map prop asset: ${key}`);
      continue;
    }
    const built = buildInstancedMeshes(model, placements, terrain, surfaceLift);
    const castsShadow = PROP_TREE_KEYS.has(key) || PROP_ROCK_KEYS.has(key);
    for (const mesh of built) {
      if (castsShadow) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      root.add(mesh);
      meshes.push(mesh);
    }
  }

  scene.add(root);
  return { root, meshes };
}

export function spawnMapMarkers(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
  entities: MapEntity[],
): Pick<MapEntitySpawnContext, 'markerRoot' | 'layout' | 'orbPlacements' | 'stoneMeshes'> {
  const markerRoot = new Group();
  markerRoot.name = 'mapMarkers';
  const stoneMeshes: Object3D[] = [];
  const orbPlacements: OrbPlacement[] = [];
  const spawnedLandmarks = new Set<string>();

  for (const e of entities) {
    switch (e.type) {
      case 'standingStone': {
        const mesh = spawnStandingStone(markerRoot, assets, terrain, e.stoneId, e.x, e.z, {
          scale: e.scale ?? STONE_SCALES[e.stoneId],
          rotationY: e.rotY,
        });
        stoneMeshes.push(mesh);
        break;
      }
      case 'landmark':
        if (!spawnedLandmarks.has(e.landmark)) {
          spawnLandmarkAt(markerRoot, assets, terrain, e.landmark, e.x, e.z, {
            scale: e.scale,
            rotationY: e.rotY,
          });
          spawnedLandmarks.add(e.landmark);
        }
        break;
      case 'orb':
        orbPlacements.push({ x: e.x, z: e.z, energy: e.energy });
        break;
      default:
        break;
    }
  }

  markerRoot.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  scene.add(markerRoot);
  const layout = buildMapLandmarkLayout(entities);

  return { markerRoot, layout, orbPlacements, stoneMeshes };
}

export function spawnMapEntities(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
  map: MapFile,
): MapEntitySpawnContext {
  const entities = map.entities ?? [];
  const props = spawnMapProps(scene, assets, terrain, entities);
  const markers = spawnMapMarkers(scene, assets, terrain, entities);

  const dispose = () => {
    for (const mesh of props.meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.dispose();
    }
    scene.remove(props.root);
    scene.remove(markers.markerRoot);
    markers.markerRoot.traverse((obj) => {
      const m = obj as Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  };

  return {
    propRoot: props.root,
    markerRoot: markers.markerRoot,
    layout: markers.layout,
    orbPlacements: markers.orbPlacements,
    stoneMeshes: markers.stoneMeshes,
    dispose,
  };
}

/** Procedural landmarks for hybrid / full procedural worlds. */
export function spawnProceduralLandmarks(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
): { landmarks: ReturnType<typeof buildLandmarkSpawner>; mountains: ReturnType<typeof buildMountainBorder> } {
  return {
    landmarks: buildLandmarkSpawner(scene, assets, terrain),
    mountains: buildMountainBorder(scene, assets, terrain),
  };
}

export function disposeMapEntities(ctx: MapEntitySpawnContext, scene: Scene): void {
  ctx.dispose();
  void scene;
}
