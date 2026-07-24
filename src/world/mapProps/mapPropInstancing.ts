// src/world/mapProps/mapPropInstancing.ts — GLTF instanced mesh builders for map-authored props
import { type DirectionalLight, InstancedMesh, Matrix4, type Mesh, type Object3D } from 'three';
import { ensureGeometryColor } from '../../rendering/ensureGeometryColor';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import { configureMeshShadowCast } from '../../rendering/sunShadow';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { createPropTerrainSurface } from '../terrain/cpu/terrainSurfaceCpu';
import { createMapPropNodeMaterials, createMapPropShadowCastMaterials } from './material/mapPropMaterial';
import type { MapPropPlacement } from './mapPropPlacement';
import { computeModelFootLocal, resolvePropInstanceMatrix } from './resolvePropInstanceMatrix';

const _instanceMatrix = new Matrix4();

/** After grass (renderOrder 2) so props composite over depth-biased blades. */
const MAP_PROP_RENDER_ORDER = 3;

function extractMeshes(modelScene: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  modelScene.traverse((c) => {
    const m = c as Mesh;
    if (m.isMesh) meshes.push(m);
  });
  if (meshes.length === 0) throw new Error('GLTF has no mesh');
  return meshes;
}

export function buildMapPropInstancedMeshes(
  sun: DirectionalLight,
  modelScene: Object3D,
  placements: MapPropPlacement[],
  terrain: MapTerrainContext,
  castsShadow = false,
  alignToSlope = false,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];
  const surface = createPropTerrainSurface(terrain);
  const modelFootLocal = computeModelFootLocal(modelScene);

  for (const srcMesh of srcMeshes) {
    const geometry = srcMesh.geometry.clone();
    ensureGeometryUv(geometry);
    ensureGeometryColor(geometry);
    const materials = createMapPropNodeMaterials(sun, srcMesh.material);
    const shadowCastMaterials = castsShadow
      ? createMapPropShadowCastMaterials(srcMesh.material)
      : undefined;
    const instanced = new InstancedMesh(geometry, materials, placements.length);
    instanced.renderOrder = MAP_PROP_RENDER_ORDER;
    instanced.castShadow = false;
    instanced.receiveShadow = true;

    placements.forEach((p, i) => {
      resolvePropInstanceMatrix(p, surface, alignToSlope, modelFootLocal, _instanceMatrix);
      instanced.setMatrixAt(i, _instanceMatrix);
    });

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
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
