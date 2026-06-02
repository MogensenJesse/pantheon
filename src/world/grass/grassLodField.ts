// src/world/grass/grassLodField.ts — Tier 3B dual InstancedMesh draw (near / far segment LOD)
import {
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { createGrassBladeGeometry } from './grassGeometry';
import { createGrassMaterial, type GrassMaterialMaps } from './grassMaterial';
import { grassLodRadiusSq, partitionGrassLodByOffsets } from './grassLodPartition';
import type { GrassTileOffsets } from './grassTileOffsets';
import { createGrassSsboRemap } from './grassSsboRemap';
import type { GrassSsbo } from './grassSsbo';
import { GRASS_CONFIG, grassInstanceCount, grassLodDualDrawEnabled } from './grassConfig';
import { logGrassLodTrace } from './grassLodTrace';
import { devSettings } from '../../core/GameState';

export interface GrassLodDrawStats {
  nearInstances: number;
  farInstances: number;
  nearSegments: number;
  farSegments: number;
  dualDraw: boolean;
}

export interface GrassLodField {
  root: Group;
  nearMesh: InstancedMesh;
  farMesh: InstancedMesh;
  nearMaterial: Material;
  farMaterial: Material;
  nearGeometry: BufferGeometry;
  farGeometry: BufferGeometry;
  stats: GrassLodDrawStats;
  setPosition: (x: number, y: number, z: number) => void;
  setVisible: (visible: boolean) => void;
  /** Rebuild near/far remap from player-centered tile offsets (dual draw only). */
  syncLodPartition?: (nearIndices: Uint32Array, farIndices: Uint32Array) => void;
  dispose: () => void;
}

function createGrassSingleField(
  ssbo: GrassSsbo,
  maps: GrassMaterialMaps,
  windAtlas: Texture | null,
): GrassLodField {
  const count = grassInstanceCount();
  const nearSegments = Math.max(1, Math.floor(GRASS_CONFIG.SEGMENTS));
  const nearGeometry = createGrassBladeGeometry(nearSegments);
  const debugRings = import.meta.env.DEV && devSettings.grassPerf.debugLodRings;
  const debugSlots = import.meta.env.DEV && devSettings.grassPerf.debugLodSlots && !debugRings;
  const nearMaterial = createGrassMaterial(ssbo, maps, null, {
    windAtlas,
    debugLodRing: debugRings ? 'single' : undefined,
    debugSlotHeatmap: debugSlots,
  });
  const nearMesh = new InstancedMesh(nearGeometry, nearMaterial, count);
  nearMesh.name = 'grassField';
  nearMesh.frustumCulled = false;

  const root = new Group();
  root.name = 'grassField';
  root.add(nearMesh);

  const emptyGeometry = createGrassBladeGeometry(1);
  const emptyMaterial = nearMaterial;
  const farMesh = new InstancedMesh(emptyGeometry, emptyMaterial, 0);
  farMesh.visible = false;

  const stats: GrassLodDrawStats = {
    nearInstances: count,
    farInstances: 0,
    nearSegments,
    farSegments: 0,
    dualDraw: false,
  };

  return {
    root,
    nearMesh,
    farMesh,
    nearMaterial,
    farMaterial: emptyMaterial,
    nearGeometry,
    farGeometry: emptyGeometry,
    stats,
    setPosition(x, y, z) {
      root.position.set(x, y, z);
    },
    setVisible(visible) {
      root.visible = visible;
    },
    dispose() {
      root.remove(nearMesh);
      nearGeometry.dispose();
      emptyGeometry.dispose();
      nearMaterial.dispose();
      nearMesh.dispose();
      farMesh.dispose();
    },
  };
}

function applyLodPartition(
  nearIndices: Uint32Array,
  farIndices: Uint32Array,
  nearMesh: InstancedMesh,
  farMesh: InstancedMesh,
  nearAttr: InstancedBufferAttribute,
  farAttr: InstancedBufferAttribute,
  stats: GrassLodDrawStats,
) {
  nearAttr.array.set(nearIndices);
  farAttr.array.set(farIndices);
  nearAttr.needsUpdate = true;
  farAttr.needsUpdate = true;
  nearMesh.count = nearIndices.length;
  farMesh.count = farIndices.length;
  stats.nearInstances = nearIndices.length;
  stats.farInstances = farIndices.length;
}

function createGrassDualLodField(
  ssbo: GrassSsbo,
  maps: GrassMaterialMaps,
  windAtlas: Texture | null,
  tileOffsets: GrassTileOffsets,
): GrassLodField {
  const maxInstances = grassInstanceCount();
  const radiusSq = grassLodRadiusSq();
  let { nearIndices, farIndices } = partitionGrassLodByOffsets(
    tileOffsets.x,
    tileOffsets.z,
    radiusSq,
  );

  const nearSegments = Math.max(1, Math.floor(GRASS_CONFIG.SEGMENTS));
  const farSegments = Math.max(1, Math.floor(GRASS_CONFIG.LOD_FAR_SEGMENTS));
  const nearGeometry = createGrassBladeGeometry(nearSegments);
  const farGeometry = createGrassBladeGeometry(farSegments);

  const nearSlotBuffer = new Uint32Array(maxInstances);
  const farSlotBuffer = new Uint32Array(maxInstances);
  nearSlotBuffer.set(nearIndices);
  farSlotBuffer.set(farIndices);

  const debugRings = import.meta.env.DEV && devSettings.grassPerf.debugLodRings;
  const debugSlots = import.meta.env.DEV && devSettings.grassPerf.debugLodSlots && !debugRings;
  const nearRemap = createGrassSsboRemap(nearSlotBuffer);
  const farRemap = createGrassSsboRemap(farSlotBuffer);
  nearGeometry.setAttribute('ssboSlot', nearRemap.geometryAttribute);
  farGeometry.setAttribute('ssboSlot', farRemap.geometryAttribute);
  const nearMaterial = createGrassMaterial(ssbo, maps, nearRemap.slotNode, {
    debugLodRing: debugRings ? 'near' : undefined,
    debugSlotHeatmap: debugSlots,
    windAtlas,
  });
  const farMaterial = createGrassMaterial(ssbo, maps, farRemap.slotNode, {
    debugLodRing: debugRings ? 'far' : undefined,
    debugSlotHeatmap: debugSlots,
    windAtlas,
  });

  const root = new Group();
  root.name = 'grassField';

  const nearMesh = new InstancedMesh(nearGeometry, nearMaterial, maxInstances);
  nearMesh.name = 'grassFieldNear';
  nearMesh.frustumCulled = false;
  nearMesh.count = nearIndices.length;

  const farMesh = new InstancedMesh(farGeometry, farMaterial, maxInstances);
  farMesh.name = 'grassFieldFar';
  farMesh.frustumCulled = false;
  farMesh.count = farIndices.length;

  root.add(nearMesh, farMesh);

  const stats: GrassLodDrawStats = {
    nearInstances: nearIndices.length,
    farInstances: farIndices.length,
    nearSegments,
    farSegments,
    dualDraw: true,
  };

  const nearAttr = nearRemap.geometryAttribute;
  const farAttr = farRemap.geometryAttribute;

  return {
    root,
    nearMesh,
    farMesh,
    nearMaterial,
    farMaterial,
    nearGeometry,
    farGeometry,
    stats,
    setPosition(x, y, z) {
      root.position.set(x, y, z);
    },
    setVisible(visible) {
      root.visible = visible;
    },
    syncLodPartition(nextNear: Uint32Array, nextFar: Uint32Array) {
      if (nextNear.length > maxInstances || nextFar.length > maxInstances) return;
      nearIndices = nextNear;
      farIndices = nextFar;
      applyLodPartition(nearIndices, farIndices, nearMesh, farMesh, nearAttr, farAttr, stats);
    },
    dispose() {
      root.remove(nearMesh, farMesh);
      nearGeometry.dispose();
      farGeometry.dispose();
      nearMaterial.dispose();
      farMaterial.dispose();
      nearMesh.dispose();
      farMesh.dispose();
    },
  };
}

export function createGrassLodField(
  ssbo: GrassSsbo,
  maps: GrassMaterialMaps,
  windAtlas: Texture | null = null,
  tileOffsets?: GrassTileOffsets,
): GrassLodField {
  if (import.meta.env.DEV) {
    logGrassLodTrace('cpu-partition');
  }

  if (!grassLodDualDrawEnabled()) {
    if (import.meta.env.DEV) {
      console.info('[grass/lod] dual draw OFF — single mesh, instanceIndex → SSBO');
    }
    return createGrassSingleField(ssbo, maps, windAtlas);
  }

  if (import.meta.env.DEV) {
    console.info('[grass/lod] dual draw ON — remap via instancedArray.toAttribute()');
  }
  if (!tileOffsets) {
    throw new Error('[grass/lod] dual draw requires GrassTileOffsets');
  }
  return createGrassDualLodField(ssbo, maps, windAtlas, tileOffsets);
}
