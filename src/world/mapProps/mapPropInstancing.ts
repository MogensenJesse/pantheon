// src/world/mapProps/mapPropInstancing.ts — GLTF instanced mesh builders for map-authored props
import {
  type DirectionalLight,
  InstancedMesh,
  Matrix4,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three';
import type { PropLodAsset } from '../../assets/assetManifest';
import { VISUAL } from '../../config/visualTuning';
import { ensureGeometryColor } from '../../rendering/ensureGeometryColor';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import { configureMeshShadowCast } from '../../rendering/sunShadow';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { createPropTerrainSurface } from '../terrain/cpu/terrainSurfaceCpu';
import { createPropLodLevels, type PropLodGroup } from './mapPropLod';
import type { MapPropPlacement } from './mapPropPlacement';
import {
  createMapPropNodeMaterials,
  createMapPropShadowCastMaterials,
} from './material/mapPropMaterial';
import { computeModelFootLocal, resolvePropInstanceMatrix } from './resolvePropInstanceMatrix';

const _footLocal = new Vector3();

/** After grass (renderOrder 2) so props composite over depth-biased blades. */
const MAP_PROP_RENDER_ORDER = 3;

export function extractMeshes(modelScene: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  modelScene.traverse((c) => {
    const m = c as Mesh;
    if (m.isMesh) meshes.push(m);
  });
  if (meshes.length === 0) throw new Error('GLTF has no mesh');
  return meshes;
}

/**
 * Build empty-capacity InstancedMeshes for one LOD scene (matrices filled by updatePropLod).
 * Shadow casting is configured when `castsShadow` is true (lod0–lod2 per shadowCastMaxLod).
 */
function buildLodInstancedMeshes(
  sun: DirectionalLight,
  modelScene: Object3D,
  capacity: number,
  castsShadow: boolean,
  lodBand: 0 | 1 | 2,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];

  for (const srcMesh of srcMeshes) {
    const geometry = srcMesh.geometry.clone();
    ensureGeometryUv(geometry);
    ensureGeometryColor(geometry);
    const materials = createMapPropNodeMaterials(sun, srcMesh.material, lodBand);
    const shadowCastMaterials = castsShadow
      ? createMapPropShadowCastMaterials(srcMesh.material)
      : undefined;
    const instanced = new InstancedMesh(geometry, materials, capacity);
    instanced.count = 0;
    instanced.visible = false;
    instanced.renderOrder = MAP_PROP_RENDER_ORDER;
    instanced.castShadow = false;
    instanced.receiveShadow = true;

    if (castsShadow) {
      configureMeshShadowCast(instanced);
      if (shadowCastMaterials) {
        instanced.userData.__shadowCastMaterial = shadowCastMaterials;
      }
    }
    result.push(instanced);
  }

  return result;
}

/**
 * Build a PropLodGroup: precomputed matrices from lod0 foot, InstancedMeshes per LOD.
 */
export function buildMapPropLodGroup(
  sun: DirectionalLight,
  key: string,
  lodAsset: PropLodAsset,
  placements: MapPropPlacement[],
  terrain: MapTerrainContext,
  castsShadow: boolean,
  alignToSlope: boolean,
): PropLodGroup {
  const surface = createPropTerrainSurface(terrain);
  const modelFootLocal = computeModelFootLocal(lodAsset.lod0, _footLocal);

  const matrices: Matrix4[] = placements.map((p) => {
    const m = new Matrix4();
    resolvePropInstanceMatrix(p, surface, alignToSlope, modelFootLocal, m);
    return m;
  });

  const capacity = Math.max(placements.length, 1);
  const shadowMax = VISUAL.props.lod.shadowCastMaxLod;
  const lod0Meshes = buildLodInstancedMeshes(
    sun,
    lodAsset.lod0,
    capacity,
    castsShadow && shadowMax >= 0,
    0,
  );
  const lod1Meshes = buildLodInstancedMeshes(
    sun,
    lodAsset.lod1,
    capacity,
    castsShadow && shadowMax >= 1,
    1,
  );
  const lod2Meshes = buildLodInstancedMeshes(
    sun,
    lodAsset.lod2,
    capacity,
    castsShadow && shadowMax >= 2,
    2,
  );

  const n0 = lod0Meshes.length;
  if (lod1Meshes.length !== n0 || lod2Meshes.length !== n0) {
    console.warn(
      `Prop LOD submesh count mismatch for ${key}: lod0=${n0} lod1=${lod1Meshes.length} lod2=${lod2Meshes.length}`,
    );
  }

  return {
    key,
    placements,
    matrices,
    lodMeshes: [lod0Meshes, lod1Meshes, lod2Meshes],
    lodLevels: createPropLodLevels(placements.length),
    lastRebinX: Number.POSITIVE_INFINITY,
    lastRebinZ: Number.POSITIVE_INFINITY,
    dirty: true,
  };
}

/** Flatten all InstancedMeshes in a LOD group (debug / dispose). */
export function flattenPropLodMeshes(group: PropLodGroup): InstancedMesh[] {
  return [...group.lodMeshes[0], ...group.lodMeshes[1], ...group.lodMeshes[2]];
}
