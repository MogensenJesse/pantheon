// src/world/grass/grassRingField.ts — one LOD ring: SSBO + InstancedMesh draw

import {

  Group,

  InstancedMesh,

  type BufferGeometry,

  type Material,

  type Texture,

} from 'three';

import { devSettings } from '../../core/GameState';

import { GrassCompaction } from './grassCompaction';

import { grassCompactionEnabled } from './grassCompactionConfig';

import { createGrassBladeGeometry } from './grassGeometry';

import { createGrassMaterial, type GrassMaterialMaps, type GrassRingDebugTint } from './grassMaterial';

import type { GrassRingDerived } from './grassFieldMetrics';

import { GRASS_CONFIG } from './grassConfig';

import type { GrassSsbo } from './grassSsbo';

import type { GrassRingUniforms } from './grassUniforms';



export interface GrassRingDrawStats {

  ringIndex: number;

  /** Instances drawn after compaction (mesh.count). */

  instances: number;

  /** Grid slots allocated in SSBO. */

  allocatedInstances: number;

  /** Same as instances — explicit draw count. */

  drawInstances: number;

  segments: number;

  outerRadius: number;

  innerRadius: number;

}



export interface GrassRingField {

  ringIndex: number;

  root: Group;

  mesh: InstancedMesh;

  material: Material;

  geometry: BufferGeometry;

  ssbo: GrassSsbo;

  compaction: GrassCompaction | null;

  ringUniforms: GrassRingUniforms;

  layout: GrassRingDerived;

  stats: GrassRingDrawStats;

  setPosition: (x: number, y: number, z: number) => void;

  setVisible: (visible: boolean) => void;

  syncDrawCount: (visible: number) => void;

  dispose: () => void;

}



const RING_DEBUG_TINTS: GrassRingDebugTint[] = ['lod0', 'lod1', 'lod2'];



export function createGrassRingField(

  ringIndex: number,

  ssbo: GrassSsbo,

  ringUniforms: GrassRingUniforms,

  layout: GrassRingDerived,

  maps: GrassMaterialMaps,

  windAtlas: Texture | null,

): GrassRingField {

  const compactionEnabled = grassCompactionEnabled();

  const compaction = compactionEnabled

    ? new GrassCompaction(ssbo.packedBuffer, layout.instanceCount)

    : null;



  const geometry = createGrassBladeGeometry({

    segments: layout.segments,

    bladeWidth: layout.bladeWidth,

    bladeHeight: GRASS_CONFIG.BLADE_HEIGHT,

  });



  if (compaction) {

    geometry.setAttribute('ssboSlot', compaction.remap.geometryAttribute);

  }



  const debugColors =

    import.meta.env.DEV && devSettings.grassPerf.debugRingColors

      ? RING_DEBUG_TINTS[ringIndex]

      : undefined;



  const material = createGrassMaterial(ssbo, maps, {

    windAtlas,

    debugRingTint: debugColors,

    ssboRemap: compaction?.remap ?? null,

    compactionEnabled,

  });



  const mesh = new InstancedMesh(geometry, material, layout.instanceCount);

  mesh.name = `grassRing${ringIndex}`;

  mesh.frustumCulled = false;

  mesh.count = layout.instanceCount;



  const root = new Group();

  root.name = `grassRing${ringIndex}Root`;

  root.add(mesh);



  const stats: GrassRingDrawStats = {

    ringIndex,

    instances: layout.instanceCount,

    allocatedInstances: layout.instanceCount,

    drawInstances: layout.instanceCount,

    segments: layout.segments,

    outerRadius: layout.outerRadius,

    innerRadius: layout.innerRadius,

  };



  const syncDrawCount = (visible: number) => {

    mesh.count = visible;

    stats.instances = visible;

    stats.drawInstances = visible;

  };



  return {

    ringIndex,

    root,

    mesh,

    material,

    geometry,

    ssbo,

    compaction,

    ringUniforms,

    layout,

    stats,

    setPosition(x, y, z) {

      root.position.set(x, y, z);

    },

    setVisible(visible) {

      root.visible = visible;

    },

    syncDrawCount,

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

  totalAllocatedInstances: number;

  setPosition: (x: number, y: number, z: number) => void;

  setVisible: (visible: boolean) => void;

  getDrawStats: () => GrassRingDrawStats[];

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

    totalInstances: ringFields.reduce((sum, r) => sum + r.stats.drawInstances, 0),

    totalAllocatedInstances: ringFields.reduce((sum, r) => sum + r.stats.allocatedInstances, 0),

    setPosition(x, y, z) {

      for (const field of ringFields) field.setPosition(x, y, z);

    },

    setVisible(visible) {

      for (const field of ringFields) field.setVisible(visible);

    },

    getDrawStats() {

      return ringFields.map((r) => ({ ...r.stats }));

    },

    dispose() {

      for (const field of ringFields) {

        root.remove(field.root);

        field.dispose();

      }

    },

  };

}

