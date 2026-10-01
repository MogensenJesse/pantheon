// src/world/grass/render/flowerRingField.ts — flower instanced sprite field
import type { DataTexture } from 'three';
import { type BufferGeometry, Group, InstancedMesh, type Material, type Texture } from 'three';
import { disableWaterReflectionLayer } from '../../../rendering/layers/waterReflectionLayers';
import type { ReceiverSunShadowNode } from '../../../rendering/sunShadow';
import type { FlowerRingDerived } from '../config/flowerConfig';
import { createFlowerRingUniforms, type FlowerRingUniforms } from '../config/flowerUniforms';
import type { TslNode } from '../tsl/tslNode';
import { createFlowerGeometry } from './flowerGeometry';
import { createFlowerMaterial } from './flowerMaterial';

export interface FlowerField {
  root: Group;
  mesh: InstancedMesh;
  material: Material;
  geometry: BufferGeometry;
  ringUniforms: FlowerRingUniforms;
  layout: FlowerRingDerived;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createFlowerField(
  grassDataMap: DataTexture,
  layout: FlowerRingDerived,
  sprite: Texture,
  windAtlas: Texture,
  sunShadow: ReceiverSunShadowNode,
  sampleTerrainSurfaceY: (worldXZ: TslNode) => TslNode,
  propExclusionMap: DataTexture,
): FlowerField {
  const ringUniforms = createFlowerRingUniforms(layout);
  const material = createFlowerMaterial(sprite, {
    sunShadow,
    windAtlas,
    ringUniforms,
    grassDataMap,
    propExclusionMap,
    sampleTerrainSurfaceY,
  });
  const geometry = createFlowerGeometry();
  const mesh = new InstancedMesh(geometry, material, layout.instanceCount);
  mesh.name = 'flowerField';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;

  const root = new Group();
  root.name = 'flowerFieldRoot';
  disableWaterReflectionLayer(root);
  root.add(mesh);

  return {
    root,
    mesh,
    material,
    geometry,
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
