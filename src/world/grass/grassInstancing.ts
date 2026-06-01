// src/world/grass/grassInstancing.ts — InstancedMesh building + matrix writes + grass geometry cache
//
// NOTE: writeGrassInstanceMatrix duplicates the per-instance compose pattern from
// world/scatter/propInstancing.ts#writeInstanceMatrix. A shared
// writeScatterInstanceMatrix helper is the natural next step (see audit C1), but
// is deliberately out of scope for the F24 split.
import {
  type BufferGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  type Mesh,
  Quaternion,
  type Scene,
  Vector3,
} from 'three';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import type { InstancedGroup, Placement } from '../scatter/placementTypes';
import type { TerrainContext } from '../TerrainGenerator';
import { applyGrassMaterial, getGrassMaterial } from './grassMaterial';

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _euler = new Euler();

/** Compose an instance matrix on top of the terrain surface and write it. */
export function writeGrassInstanceMatrix(
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

function getGrassGeometry(
  prototype: Mesh,
  meshName: string,
  cache: Map<string, BufferGeometry>,
): BufferGeometry {
  let geometry = cache.get(meshName);
  if (!geometry) {
    geometry = prototype.geometry.clone();
    ensureGeometryUv(geometry);
    cache.set(meshName, geometry);
  }
  return geometry;
}

/**
 * Build one InstancedMesh for `placements`, reusing or caching its geometry
 * by meshName. Returns an array so callers can stay symmetric with the prop
 * scatterer (which fans out per-mesh).
 */
export function buildGrassInstancedMeshes(
  prototype: Mesh,
  meshName: string,
  placements: Placement[],
  terrain: TerrainContext,
  surfaceLift: number,
  geometryCache: Map<string, BufferGeometry>,
): InstancedMesh[] {
  const geometry = getGrassGeometry(prototype, meshName, geometryCache);
  const instanced = new InstancedMesh(geometry, getGrassMaterial(), placements.length);
  applyGrassMaterial(instanced);

  placements.forEach((p, i) => {
    writeGrassInstanceMatrix(instanced, i, p, terrain, surfaceLift);
  });

  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  return [instanced];
}

export function disposeGrassGroup(
  scene: Scene,
  group: InstancedGroup,
  disposeGeometry: boolean,
): void {
  scene.remove(group.mesh);
  if (disposeGeometry) {
    group.mesh.geometry.dispose();
  }
}
