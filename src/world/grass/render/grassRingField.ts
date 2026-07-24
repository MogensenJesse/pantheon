// src/world/grass/render/grassRingField.ts — one LOD ring: SSBO + InstancedMesh draw
import { type BufferGeometry, Group, InstancedMesh, type Material, type Texture } from 'three';
import type { ReceiverSunShadowNode } from '../../../rendering/sunShadow';
import { disableWaterReflectionLayer } from '../../../rendering/layers/waterReflectionLayers';
import type { GrassSsbo } from '../compute/grassSsbo';
import { GRASS_CONFIG } from '../config/grassConfig';
import type { GrassRingDerived } from '../config/grassFieldMetrics';
import type { GrassRingUniforms } from '../config/grassUniforms';
import { createGrassBladeGeometry } from './grassGeometry';
import { createGrassMaterial, type GrassLodTier } from './grassMaterial';

function grassLodTierForRing(ringIndex: number): GrassLodTier {
  if (ringIndex <= 0) return 0;
  if (ringIndex === 1) return 1;
  return 2;
}

export interface GrassRingField {
  ringIndex: number;
  root: Group;
  mesh: InstancedMesh;
  material: Material;
  geometry: BufferGeometry;
  ssbo: GrassSsbo;
  ringUniforms: GrassRingUniforms;
  layout: GrassRingDerived;
  setPosition: (x: number, y: number, z: number) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createGrassRingField(
  ringIndex: number,
  ssbo: GrassSsbo,
  ringUniforms: GrassRingUniforms,
  layout: GrassRingDerived,
  windAtlas: Texture | null,
  sunShadow: ReceiverSunShadowNode,
): GrassRingField {
  const geometry = createGrassBladeGeometry({
    segments: layout.segments,
    bladeWidth: layout.bladeWidth,
    bladeHeight: GRASS_CONFIG.BLADE_HEIGHT,
  });
  geometry.setIndirect(ssbo.indirectBuffer);

  const lodTier = grassLodTierForRing(ringIndex);
  const material = createGrassMaterial(ssbo, {
    sunShadow,
    windAtlas,
    lodTier,
  });

  const mesh = new InstancedMesh(geometry, material, layout.instanceCount);
  mesh.name = `grassRing${ringIndex}`;
  mesh.frustumCulled = false;
  mesh.receiveShadow = lodTier < 2;
  mesh.renderOrder = 2;

  const root = new Group();
  root.name = `grassRing${ringIndex}Root`;
  disableWaterReflectionLayer(root);
  root.add(mesh);

  return {
    ringIndex,
    root,
    mesh,
    material,
    geometry,
    ssbo,
    ringUniforms,
    layout,
    setPosition(x, y, z) {
      root.position.set(x, y, z);
    },
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

export interface GrassRingFieldGroup {
  root: Group;
  rings: GrassRingField[];
  totalInstances: number;
  setPosition: (x: number, y: number, z: number) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createGrassRingFieldGroup(ringFields: GrassRingField[]): GrassRingFieldGroup {
  const root = new Group();
  root.name = 'grassField';
  disableWaterReflectionLayer(root);
  for (const field of ringFields) {
    root.add(field.root);
  }

  return {
    root,
    rings: ringFields,
    totalInstances: ringFields.reduce((sum, r) => sum + r.layout.instanceCount, 0),
    setPosition(x, y, z) {
      for (const field of ringFields) field.setPosition(x, y, z);
    },
    setVisible(visible) {
      for (const field of ringFields) field.setVisible(visible);
    },
    dispose() {
      for (const field of ringFields) {
        root.remove(field.root);
        field.dispose();
      }
    },
  };
}
