// src/rendering/bloomLayer.ts — selective bloom layer tagging and render masking
import { Mesh, MeshBasicMaterial, type Material, type Object3D, Points } from 'three';
import { PHASE0 } from '../config/phase0';

export const BLOOM_LAYER = PHASE0.BLOOM.LAYER;

const darkMaterial = new MeshBasicMaterial({ color: 0x000000 });
const savedMaterials = new Map<string, Material | Material[]>();
const hiddenObjects: Object3D[] = [];
const savedMeshes: Mesh[] = [];

export function enableBloomLayer(object: Object3D): void {
  object.traverse((child) => {
    child.layers.enable(BLOOM_LAYER);
  });
}

/** Hide / black out objects not on the bloom layer before the bloom render pass. */
export function darkenNonBloomed(root: Object3D): void {
  root.traverse((obj) => {
    if (obj.layers.isEnabled(BLOOM_LAYER)) return;

    if ((obj as Points).isPoints) {
      if (obj.visible) {
        obj.visible = false;
        hiddenObjects.push(obj);
      }
      return;
    }

    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;

    savedMeshes.push(mesh);
    savedMaterials.set(mesh.uuid, mesh.material);
    mesh.material = darkMaterial;
  });
}

export function restoreNonBloomed(): void {
  for (const obj of hiddenObjects) {
    obj.visible = true;
  }
  hiddenObjects.length = 0;

  for (const mesh of savedMeshes) {
    const mat = savedMaterials.get(mesh.uuid);
    if (mat) mesh.material = mat;
  }
  savedMeshes.length = 0;
  savedMaterials.clear();
}
