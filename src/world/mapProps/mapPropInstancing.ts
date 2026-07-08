// src/world/mapProps/mapPropInstancing.ts — GLTF instanced mesh builders for map-authored props
import {
  type DirectionalLight,
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
import { WORLD } from '../WorldConfig';
import { createMapPropNodeMaterials } from './mapPropMaterial';
import type { MapPropPlacement } from './mapPropPlacement';
import {
  composePropWorldQuaternion,
  sampleTerrainNormalFromHeight,
  terrainNormalSampleStepM,
} from './mapPropTerrainAlign';

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _terrainNormal = new Vector3();
const _footLocal = new Vector3();
const _footWorld = new Vector3();

function meshFootLocal(srcMesh: Mesh, target = _footLocal): Vector3 {
  if (!srcMesh.geometry.boundingBox) srcMesh.geometry.computeBoundingBox();
  const bb = srcMesh.geometry.boundingBox!;
  return target.set((bb.min.x + bb.max.x) * 0.5, bb.min.y, (bb.min.z + bb.max.z) * 0.5);
}

function writeInstanceMatrix(
  mesh: InstancedMesh,
  index: number,
  placement: MapPropPlacement,
  terrain: TerrainContext,
  alignToSlope: boolean,
  footLocal?: Vector3,
): void {
  const y = terrain.getWorldY(placement.x, placement.z) + placement.surfaceLift;
  if (alignToSlope) {
    const sampleStepM = terrainNormalSampleStepM(terrain.grids?.size ?? WORLD.SEGMENTS);
    sampleTerrainNormalFromHeight(
      terrain.getWorldY,
      placement.x,
      placement.z,
      sampleStepM,
      _terrainNormal,
    );
    composePropWorldQuaternion(_quat, _terrainNormal, placement.yRotation, true);
  } else {
    composePropWorldQuaternion(_quat, _terrainNormal, placement.yRotation, false);
  }
  _scl.setScalar(placement.scale);
  if (alignToSlope && footLocal) {
    _pos.set(placement.x, 0, placement.z);
    _matrix.compose(_pos, _quat, _scl);
    _footWorld.copy(footLocal).applyMatrix4(_matrix);
    _pos.y = y - _footWorld.y;
  } else {
    _pos.set(placement.x, y, placement.z);
  }
  _matrix.compose(_pos, _quat, _scl);
  mesh.setMatrixAt(index, _matrix);
}

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
  terrain: TerrainContext,
  castsShadow = false,
  alignToSlope = false,
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

    const footLocal = alignToSlope ? meshFootLocal(srcMesh) : undefined;

    placements.forEach((p, i) => {
      writeInstanceMatrix(instanced, i, p, terrain, alignToSlope, footLocal);
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
