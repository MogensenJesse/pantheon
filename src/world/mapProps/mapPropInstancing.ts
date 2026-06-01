// src/world/mapProps/mapPropInstancing.ts — GLTF instanced mesh builders for map-authored props
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

function cloneMapPropMaterial(base: Material): Material {
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

function prepareMapPropMaterials(material: Material | Material[]): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((m) => cloneMapPropMaterial(m));
  }
  return cloneMapPropMaterial(material);
}

function writeInstanceMatrix(
  mesh: InstancedMesh,
  index: number,
  placement: MapPropPlacement,
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

export function buildMapPropInstancedMeshes(
  modelScene: Object3D,
  placements: MapPropPlacement[],
  terrain: TerrainContext,
  surfaceLift: number,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];

  for (const srcMesh of srcMeshes) {
    const geometry = srcMesh.geometry.clone();
    ensureGeometryUv(geometry);
    const materials = prepareMapPropMaterials(srcMesh.material);
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

/** @deprecated Use buildMapPropInstancedMeshes */
export const buildInstancedMeshes = buildMapPropInstancedMeshes;
