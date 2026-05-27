// src/world/cloud/cloudInstancing.ts — InstancedMesh builder + per-frame billboard matrix updates
import { InstancedMesh, Object3D, PlaneGeometry, Vector3, type Texture } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { CloudInstance } from './cloudLayout';
import {
  createCloudSpriteMaterial,
  type CloudMaterialUniforms,
} from './cloudSpriteMaterial';

export interface SpriteLayer {
  mesh: InstancedMesh;
  material: MeshBasicNodeMaterial;
  uniforms: CloudMaterialUniforms;
  geometry: PlaneGeometry;
  instances: CloudInstance[];
}

const _dummy = new Object3D();

/** Build one sprite layer: shared 1×1 plane geometry, unique material, N instances. */
export function createSpriteLayer(
  cloudTexture: Texture,
  instances: CloudInstance[],
  renderOrder: number,
): SpriteLayer {
  const { mat, uniforms } = createCloudSpriteMaterial(cloudTexture);
  const geometry = new PlaneGeometry(1, 1);
  const mesh = new InstancedMesh(geometry, mat, instances.length);
  mesh.frustumCulled = true;
  mesh.renderOrder = renderOrder;
  return { mesh, material: mat, uniforms, geometry, instances };
}

/** Release geometry + material; safe to call once per layer at teardown. */
export function disposeSpriteLayer(layer: SpriteLayer): void {
  layer.mesh.dispose();
  layer.geometry.dispose();
  layer.material.dispose();
}

/**
 * Per-frame: orient each instance card toward the camera then apply its
 * authored Z-rotation jitter. Recomputes the bounding sphere because instance
 * matrices can move arbitrarily and three.js does not detect that on its own.
 */
export function writeBillboardMatrices(
  mesh: InstancedMesh,
  instances: CloudInstance[],
  cameraPos: Vector3,
): void {
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    _dummy.position.set(inst.x, inst.y, inst.z);
    _dummy.scale.setScalar(inst.scale);
    _dummy.lookAt(cameraPos);
    _dummy.rotateZ(inst.zRot);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}
