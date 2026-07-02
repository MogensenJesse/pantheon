// src/world/mapProps/mapPropInstancing.ts — GLTF instanced mesh builders for map-authored props
import {
  type DirectionalLight,
  Euler,
  InstancedMesh,
  Matrix4,
  type Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { ensureGeometryColor } from '../../rendering/ensureGeometryColor';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import { configureMeshShadowCast } from '../../rendering/sunShadow';
import type { TerrainContext } from '../TerrainGenerator';
import { createMapPropNodeMaterials } from './mapPropMaterial';
import type { MapPropPlacement } from './mapPropPlacement';

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _euler = new Euler();

function extractMeshes(modelScene: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  modelScene.traverse((c) => {
    const m = c as Mesh;
    if (m.isMesh) meshes.push(m);
  });
  if (meshes.length === 0) throw new Error('GLTF has no mesh');
  return meshes;
}

function writeInstanceMatrix(
  mesh: InstancedMesh,
  index: number,
  placement: MapPropPlacement,
  terrain: TerrainContext,
): void {
  const y = terrain.getWorldY(placement.x, placement.z) + placement.surfaceLift;
  _pos.set(placement.x, y, placement.z);
  _euler.set(0, placement.yRotation, 0);
  _quat.setFromEuler(_euler);
  _scl.setScalar(placement.scale);
  _matrix.compose(_pos, _quat, _scl);
  mesh.setMatrixAt(index, _matrix);
}

export function buildMapPropInstancedMeshes(
  sun: DirectionalLight,
  modelScene: Object3D,
  placements: MapPropPlacement[],
  terrain: TerrainContext,
  castsShadow = false,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];

  for (const srcMesh of srcMeshes) {
    const geometry = srcMesh.geometry.clone();
    ensureGeometryUv(geometry);
    ensureGeometryColor(geometry);
    const materials = createMapPropNodeMaterials(sun, srcMesh.material);
    const instanced = new InstancedMesh(geometry, materials, placements.length);
    instanced.castShadow = false;
    instanced.receiveShadow = true;

    placements.forEach((p, i) => {
      writeInstanceMatrix(instanced, i, p, terrain);
    });

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    if (castsShadow) {
      configureMeshShadowCast(instanced);
    }
    result.push(instanced);
  }

  return result;
}
