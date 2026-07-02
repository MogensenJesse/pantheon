// src/world/map/MapEntitySpawner.ts — spawn authored props and collect orb placements from map entities
import { type DirectionalLight, Group, type InstancedMesh, type Scene } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import type { OrbPlacement } from '../../entities/initOrbSystemFromMap';
import type { MapEntity, MapFile } from '../../map/MapTypes';
import { buildMapPropInstancedMeshes } from '../mapProps/mapPropInstancing';
import type { MapPropPlacement } from '../mapProps/mapPropPlacement';
import { propCastsShadow } from '../mapProps/propShadowKeys';
import type { TerrainContext } from '../TerrainGenerator';
import { disableWaterReflectionLayer } from '../water/waterReflectionLayers';

export interface MapEntitySpawnContext {
  propRoot: Group;
  orbPlacements: OrbPlacement[];
  debugInstancedMeshes: InstancedMesh[];
  dispose: () => void;
}

function entityToPlacement(e: Extract<MapEntity, { type: 'prop' }>): MapPropPlacement {
  return {
    x: e.x,
    z: e.z,
    yRotation: e.rotY,
    scale: e.scale,
    surfaceLift: e.surfaceLift ?? 0,
  };
}

export function collectOrbPlacements(entities: MapEntity[]): OrbPlacement[] {
  const placements: OrbPlacement[] = [];
  for (const e of entities) {
    if (e.type === 'orb') placements.push({ x: e.x, z: e.z, energy: e.energy });
  }
  return placements;
}

export function spawnMapProps(
  scene: Scene,
  sun: DirectionalLight,
  assets: AssetRegistry,
  terrain: TerrainContext,
  entities: MapEntity[],
): { root: Group; meshes: InstancedMesh[] } {
  const root = new Group();
  root.name = 'mapProps';
  disableWaterReflectionLayer(root);
  const meshes: InstancedMesh[] = [];
  const byKey = new Map<string, MapPropPlacement[]>();

  for (const e of entities) {
    if (e.type !== 'prop') continue;
    let placements = byKey.get(e.key);
    if (!placements) {
      placements = [];
      byKey.set(e.key, placements);
    }
    placements.push(entityToPlacement(e));
  }

  for (const [key, placements] of byKey) {
    const model = assets.get(key);
    if (!model) {
      console.warn(`Missing map prop asset: ${key}`);
      continue;
    }
    const castsShadow = propCastsShadow(key);
    const built = buildMapPropInstancedMeshes(sun, model, placements, terrain, castsShadow);
    for (const mesh of built) {
      if (castsShadow) {
        mesh.castShadow = true;
      }
      root.add(mesh);
      meshes.push(mesh);
    }
  }

  scene.add(root);
  return { root, meshes };
}

export function spawnMapEntities(
  scene: Scene,
  sun: DirectionalLight,
  assets: AssetRegistry,
  terrain: TerrainContext,
  map: MapFile,
): MapEntitySpawnContext {
  const entities = map.entities ?? [];
  const props = spawnMapProps(scene, sun, assets, terrain, entities);
  const orbPlacements = collectOrbPlacements(entities);

  const dispose = () => {
    for (const mesh of props.meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.dispose();
    }
    scene.remove(props.root);
  };

  return {
    propRoot: props.root,
    orbPlacements,
    debugInstancedMeshes: props.meshes,
    dispose,
  };
}
