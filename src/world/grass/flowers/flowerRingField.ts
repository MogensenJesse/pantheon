// src/world/grass/flowers/flowerRingField.ts — flower instanced sprite field
import {
  Group,
  InstancedMesh,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import type { DataTexture } from 'three';
import type { FlowerRingDerived } from './flowerConfig';
import { createFlowerMaterial } from './flowerMaterial';
import {
  FlowerSsbo,
  createFlowerRingUniforms,
  type FlowerRingUniforms,
} from './flowerSsbo';

export interface FlowerField {
  root: Group;
  mesh: InstancedMesh;
  material: Material;
  geometry: BufferGeometry;
  ssbo: FlowerSsbo;
  ringUniforms: FlowerRingUniforms;
  layout: FlowerRingDerived;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createFlowerField(
  grassDataMap: DataTexture,
  layout: FlowerRingDerived,
  sprite: Texture,
  windAtlas: Texture | null,
): FlowerField {
  const ringUniforms = createFlowerRingUniforms(layout);
  const ssbo = new FlowerSsbo(grassDataMap, ringUniforms, layout.instanceCount, windAtlas);
  const material = createFlowerMaterial(ssbo, sprite, grassDataMap);
  const geometry = new PlaneGeometry(1, 1);
  const mesh = new InstancedMesh(geometry, material, layout.instanceCount);
  mesh.name = 'flowerField';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.count = layout.instanceCount;

  const root = new Group();
  root.name = 'flowerFieldRoot';
  root.add(mesh);

  return {
    root,
    mesh,
    material,
    geometry,
    ssbo,
    ringUniforms,
    layout,
    setVisible(visible) {
      root.visible = visible;
    },
    dispose() {
      root.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
