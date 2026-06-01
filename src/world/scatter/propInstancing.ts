// src/world/scatter/propInstancing.ts — GLTF instanced mesh builders for trees/rocks/plants
import {
  DoubleSide,
  Euler,
  InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  Quaternion,
  type Texture,
  Vector3,
} from 'three';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import type { TerrainContext } from '../TerrainGenerator';
import type { Placement } from './placementTypes';

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

function cloneScatterMaterial(base: Material): Material {
  const mat = base.clone();
  mat.side = DoubleSide;
  const std = mat as Material & { map?: Texture | null; alphaTest?: number };
  if (std.map) {
    std.alphaTest = 0.2;
    std.transparent = false;
    std.depthWrite = true;
  }
  return mat;
}

function prepareScatterMaterials(material: Material | Material[]): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((m) => cloneScatterMaterial(m));
  }
  return cloneScatterMaterial(material);
}

function writeInstanceMatrix(
  mesh: InstancedMesh,
  index: number,
  placement: Placement,
  terrain: TerrainContext,
  surfaceLift: number,
): void {
  const y = terrain.getWorldY(placement.x, placement.z) + surfaceLift;
  _pos.set(placement.x, y, placement.z);
  _euler.set(0, placement.yRotation, 0);
  _quat.setFromEuler(_euler);
  _scl.setScalar(placement.scale);
  _matrix.compose(_pos, _quat, _scl);
  mesh.setMatrixAt(index, _matrix);
}

export function buildInstancedMeshes(
  modelScene: Object3D,
  placements: Placement[],
  terrain: TerrainContext,
  surfaceLift: number,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];

  for (const srcMesh of srcMeshes) {
    const geometry = srcMesh.geometry.clone();
    ensureGeometryUv(geometry);
    const materials = prepareScatterMaterials(srcMesh.material);
    const instanced = new InstancedMesh(geometry, materials, placements.length);
    instanced.castShadow = false;
    instanced.receiveShadow = false;

    placements.forEach((p, i) => {
      writeInstanceMatrix(instanced, i, p, terrain, surfaceLift);
    });

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    result.push(instanced);
  }

  return result;
}
