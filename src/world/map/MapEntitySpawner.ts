// src/world/map/MapEntitySpawner.ts — spawn authored props and collect orb placements from map entities
import { type DirectionalLight, Group, type InstancedMesh, type Scene } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import { VISUAL } from '../../config/visualTuning';
import type { OrbPlacement } from '../../entities/EnergyOrb';
import type { MapEntity, MapFile } from '../../map/MapTypes';
import { enableWaterReflectionLayer } from '../../rendering/layers/waterReflectionLayers';
import { unregisterMeshShadowCast } from '../../rendering/sunShadow';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { propReflectsInWater } from '../mapProps/config/propReflectionKeys';
import { propCastsShadow } from '../mapProps/config/propShadowKeys';
import { buildMapPropLodGroup, flattenPropLodMeshes } from '../mapProps/mapPropInstancing';
import type { PropLodGroup } from '../mapProps/mapPropLod';
import type { MapPropPlacement } from '../mapProps/mapPropPlacement';
import { propAlignsToTerrainSlope } from '../mapProps/mapPropTerrainAlign';

export interface MapEntitySpawnContext {
  propRoot: Group;
  orbPlacements: OrbPlacement[];
  debugInstancedMeshes: InstancedMesh[];
  propLodGroups: PropLodGroup[];
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
  terrain: MapTerrainContext,
  entities: MapEntity[],
): { root: Group; meshes: InstancedMesh[]; lodGroups: PropLodGroup[] } {
  const root = new Group();
  root.name = 'mapProps';
  // Reflection opt-in happens per mesh below — instanced meshes default to layer 0 only.
  const meshes: InstancedMesh[] = [];
  const lodGroups: PropLodGroup[] = [];
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
    const lodAsset = assets.get(key);
    if (!lodAsset) {
      console.warn(`Missing map prop asset: ${key}`);
      continue;
    }
    const castsShadow = propCastsShadow(key);
    const reflectsInWater = propReflectsInWater(key);
    const alignToSlope = propAlignsToTerrainSlope(key);
    const group = buildMapPropLodGroup(
      sun,
      key,
      lodAsset,
      placements,
      terrain,
      castsShadow,
      alignToSlope,
    );
    lodGroups.push(group);

    const shadowMax = VISUAL.props.lod.shadowCastMaxLod;
    for (const mesh of flattenPropLodMeshes(group)) {
      const castsThis =
        castsShadow &&
        ((shadowMax >= 0 && group.lodMeshes[0].includes(mesh)) ||
          (shadowMax >= 1 && group.lodMeshes[1].includes(mesh)) ||
          (shadowMax >= 2 && group.lodMeshes[2].includes(mesh)));
      if (castsThis) mesh.castShadow = true;
      if (reflectsInWater) enableWaterReflectionLayer(mesh);
      root.add(mesh);
      meshes.push(mesh);
    }
  }

  // Groups start dirty; gameTick updatePropLod rebinns on first frame near the player.

  scene.add(root);
  return { root, meshes, lodGroups };
}

export function spawnMapEntities(
  scene: Scene,
  sun: DirectionalLight,
  assets: AssetRegistry,
  terrain: MapTerrainContext,
  map: MapFile,
): MapEntitySpawnContext {
  const entities = map.entities ?? [];
  const props = spawnMapProps(scene, sun, assets, terrain, entities);
  const orbPlacements = collectOrbPlacements(entities);

  const dispose = () => {
    for (const mesh of props.meshes) {
      unregisterMeshShadowCast(mesh);
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
    propLodGroups: props.lodGroups,
    dispose,
  };
}
