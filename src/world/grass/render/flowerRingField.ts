// src/world/grass/flowers/flowerRingField.ts — flower instanced sprite field

import type { DataTexture } from 'three';
import {
  type BufferGeometry,
  Group,
  InstancedMesh,
  type Material,
  PlaneGeometry,
  type Texture,
} from 'three';
import {
  createFlowerRingUniforms,
  type FlowerRingUniforms,
  FlowerSsbo,
} from '../compute/flowerSsbo';
import type { FlowerRingDerived } from '../config/flowerConfig';
import { createFlowerMaterial } from './flowerMaterial';

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
  const ssbo = new FlowerSsbo(grassDataMap, ringUniforms, layout.instanceCount, 6, windAtlas);
  const material = createFlowerMaterial(ssbo, sprite);
  const geometry = new PlaneGeometry(1, 1);
  geometry.setIndirect(ssbo.indirectBuffer);
  const mesh = new InstancedMesh(geometry, material, layout.instanceCount);
  mesh.name = 'flowerField';
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;

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
      ssbo.dispose();
    },
  };
}
