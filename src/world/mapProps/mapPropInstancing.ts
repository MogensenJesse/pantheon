// src/world/mapProps/mapPropInstancing.ts — GLTF instanced mesh builders for map-authored props
import {
  type DirectionalLight,
  InstancedMesh,
  type Material,
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
  createMapPropCoarseShadowCastMaterials,
  createMapPropNodeMaterials,
  createMapPropShadowCastMaterials,
} from './material/mapPropMaterial';
import { computeModelFootLocal, resolvePropInstanceMatrix } from './resolvePropInstanceMatrix';
import type { TreeSway } from './sway/treeSway';
import { treeSwayFor } from './sway/treeSwayProfile';

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

/** Picks the node materials for one LOD band of a prop scene (default: standard prop materials). */
export type PropMaterialResolver = (
  source: Material | Material[],
  lodBand: 0 | 1 | 2,
) => Material | Material[];

/**
 * Build empty-capacity InstancedMeshes for one LOD scene (matrices filled by updatePropLod).
 * Shadow casting is configured when `castsShadow` is true (lod0–lod2 per shadowCastMaxLod).
 */
export function buildLodInstancedMeshes(
  sun: DirectionalLight,
  modelScene: Object3D,
  capacity: number,
  castsShadow: boolean,
  lodBand: 0 | 1 | 2,
  resolveMaterials?: PropMaterialResolver,
  sway?: TreeSway | null,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];

  for (const srcMesh of srcMeshes) {
    const geometry = srcMesh.geometry.clone();
    ensureGeometryUv(geometry);
    ensureGeometryColor(geometry);
    const materials = resolveMaterials
      ? resolveMaterials(srcMesh.material, lodBand)
      : createMapPropNodeMaterials(sun, srcMesh.material, lodBand, sway);
    const instanced = new InstancedMesh(geometry, materials, capacity);
    instanced.count = 0;
    instanced.visible = false;
    instanced.renderOrder = MAP_PROP_RENDER_ORDER;
    instanced.castShadow = false;
    instanced.receiveShadow = true;

    if (castsShadow) {
      configureMeshShadowCast(instanced, {
        cast: createMapPropShadowCastMaterials(srcMesh.material),
        coarse: createMapPropCoarseShadowCastMaterials(srcMesh.material),
      });
    }
    result.push(instanced);
  }

  // Every submesh of a band gets the same placements, so share one matrix buffer (written once by
  // updatePropLod). The first mesh's attribute is the one that stays.
  for (let i = 1; i < result.length; i++) result[i]!.instanceMatrix = result[0]!.instanceMatrix;

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
  const lodMeshes = buildLodMeshSets(sun, key, lodAsset, capacity, castsShadow);

  return {
    key,
    placements,
    matrices,
    lodMeshes,
    lodLevels: createPropLodLevels(placements.length),
    lastRebinX: Number.POSITIVE_INFINITY,
    lastRebinZ: Number.POSITIVE_INFINITY,
    dirty: true,
    resnap: { foot: modelFootLocal.clone(), alignToSlope },
  };
}

/**
 * Re-seat static map props inside a world rectangle after the ground under them moved (the village
 * levelling its pads): recompute their matrices on the new surface and rebin on the next frame.
 */
export function resnapMapProps(
  groups: readonly PropLodGroup[],
  terrain: MapTerrainContext,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): void {
  const surface = createPropTerrainSurface(terrain);
  for (const group of groups) {
    const resnap = group.resnap;
    if (!resnap) continue;
    let changed = false;
    for (let i = 0; i < group.placements.length; i++) {
      const p = group.placements[i]!;
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      resolvePropInstanceMatrix(p, surface, resnap.alignToSlope, resnap.foot, group.matrices[i]!);
      changed = true;
    }
    if (changed) group.dirty = true;
  }
}

/**
 * Build a growable PropLodGroup: `placements` and `matrices` start empty and the caller pushes
 * and pops them (never beyond `capacity`) and sets `dirty`; updatePropLod rebins as usual.
 */
export function buildDynamicPropLodGroup(
  sun: DirectionalLight,
  key: string,
  lodAsset: PropLodAsset,
  capacity: number,
  castsShadow: boolean,
  resolveMaterials?: PropMaterialResolver,
  sways = true,
): PropLodGroup {
  return {
    key,
    placements: [],
    matrices: [],
    lodMeshes: buildLodMeshSets(sun, key, lodAsset, capacity, castsShadow, resolveMaterials, sways),
    lodLevels: createPropLodLevels(capacity),
    lastRebinX: Number.POSITIVE_INFINITY,
    lastRebinZ: Number.POSITIVE_INFINITY,
    dirty: true,
  };
}

function buildLodMeshSets(
  sun: DirectionalLight,
  key: string,
  lodAsset: PropLodAsset,
  capacity: number,
  castsShadow: boolean,
  resolveMaterials?: PropMaterialResolver,
  sways = true,
): PropLodGroup['lodMeshes'] {
  const shadowMax = VISUAL.props.lod.shadowCastMaxLod;
  // Trees sway; a caller that brings its own materials (the village kit) gets none, nor one that turns it off (a
  // sapling: the lean follows the model's height, not the instance's scale). One profile for every band, measured
  // on lod0, so the lean does not change when a tree changes band.
  const sway = resolveMaterials || !sways ? null : treeSwayFor(key, lodAsset.lod0);
  const lod0Meshes = buildLodInstancedMeshes(
    sun,
    lodAsset.lod0,
    capacity,
    castsShadow && shadowMax >= 0,
    0,
    resolveMaterials,
    sway,
  );
  const lod1Meshes = buildLodInstancedMeshes(
    sun,
    lodAsset.lod1,
    capacity,
    castsShadow && shadowMax >= 1,
    1,
    resolveMaterials,
    sway,
  );
  const lod2Meshes = buildLodInstancedMeshes(
    sun,
    lodAsset.lod2,
    capacity,
    castsShadow && shadowMax >= 2,
    2,
    resolveMaterials,
    sway,
  );

  const n0 = lod0Meshes.length;
  if (lod1Meshes.length !== n0 || lod2Meshes.length !== n0) {
    console.warn(
      `Prop LOD submesh count mismatch for ${key}: lod0=${n0} lod1=${lod1Meshes.length} lod2=${lod2Meshes.length}`,
    );
  }

  return [lod0Meshes, lod1Meshes, lod2Meshes];
}

/** Flatten all InstancedMeshes in a LOD group (debug / dispose). */
export function flattenPropLodMeshes(group: PropLodGroup): InstancedMesh[] {
  return [...group.lodMeshes[0], ...group.lodMeshes[1], ...group.lodMeshes[2]];
}
