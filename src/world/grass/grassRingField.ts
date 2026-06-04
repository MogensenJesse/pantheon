// src/world/grass/grassRingField.ts — one LOD ring: SSBO + InstancedMesh draw
import {
  Group,
  InstancedMesh,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { createGrassBladeGeometry } from './grassGeometry';
import { createGrassMaterial } from './grassMaterial';
import type { GrassRingDerived } from './grassFieldMetrics';
import { GRASS_CONFIG } from './grassConfig';
import type { GrassSsbo } from './grassSsbo';
import type { GrassRingUniforms } from './grassUniforms';

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
): GrassRingField {
  const geometry = createGrassBladeGeometry({
    segments: layout.segments,
    bladeWidth: layout.bladeWidth,
    bladeHeight: GRASS_CONFIG.BLADE_HEIGHT,
  });

  const material = createGrassMaterial(ssbo, { windAtlas });

  const mesh = new InstancedMesh(geometry, material, layout.instanceCount);
  mesh.name = `grassRing${ringIndex}`;
  mesh.frustumCulled = false;
  mesh.count = layout.instanceCount;

  const root = new Group();
  root.name = `grassRing${ringIndex}Root`;
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
