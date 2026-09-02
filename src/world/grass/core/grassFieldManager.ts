// src/world/grass/core/grassFieldManager.ts — grass/flower ring lifecycle (create, rebuild, swap)
import type { DataTexture, Scene, Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import type { ReceiverSunShadowNode } from '../../../rendering/sunShadow';
import type { createTerrainSurfaceHeightTsl } from '../../terrain/tsl/terrainSurfaceHeightTsl';
import { GrassSsbo } from '../compute/grassSsbo';
import {
  registerFlowerRingUniforms,
  registerGrassRingUniforms,
} from '../config/applyGrassDevUniforms';
import { flowersEnabled, readFlowerLayout } from '../config/flowerConfig';
import { GRASS_RING_COUNT, readGrassRingsLayout } from '../config/grassConfig';
import { createGrassRingUniforms } from '../config/grassUniforms';
import type { createGrassDataTexture } from '../data/grassDataTexture';
import type { loadGrassWindAtlas } from '../data/loadGrassWindAtlas';
import { createFlowerField, type FlowerField } from '../render/flowerRingField';
import { grassBladeIndexCount } from '../render/grassGeometry';
import {
  createGrassRingField,
  createGrassRingFieldGroup,
  type GrassRingField,
} from '../render/grassRingField';

export interface GrassFieldAssets {
  grassDataMap: ReturnType<typeof createGrassDataTexture>;
  propExclusionMap: DataTexture;
  windAtlas: Awaited<ReturnType<typeof loadGrassWindAtlas>>;
  flowerSprite: Texture;
  sunShadow: ReceiverSunShadowNode;
  /** LOD2: far Vogel + cloud only (no near PCSS). */
  farSunShadow: ReceiverSunShadowNode;
  terrainSurfaceHeight: ReturnType<typeof createTerrainSurfaceHeightTsl>;
}

export interface GrassFieldState {
  ringFields: GrassRingField[];
  fieldGroup: ReturnType<typeof createGrassRingFieldGroup>;
  flowerField: FlowerField | null;
}

export interface GrassFieldManager {
  state: GrassFieldState;
  boot: (renderer: WebGPURenderer) => Promise<void>;
  rebuildAll: (renderer: WebGPURenderer) => Promise<void>;
  setWorldPosition: (x: number, z: number) => void;
  dispose: () => void;
}

function canUseFlowers(sprite: Texture | null): sprite is Texture {
  return flowersEnabled() && sprite !== null;
}

function disposeRingFields(fields: GrassRingField[]): void {
  for (const field of fields) {
    field.dispose();
  }
}

async function runFieldCompactBoot(
  renderer: WebGPURenderer,
  field: GrassRingField | FlowerField,
): Promise<void> {
  await renderer.computeAsync(field.ssbo.computeInit);
  await renderer.computeAsync(field.ssbo.computeInitIndirect);
  const mark = 'computeMarkTiles' in field.ssbo ? field.ssbo.computeMarkTiles : null;
  if (mark) await renderer.computeAsync(mark);
  await renderer.computeAsync(field.ssbo.computeUpdateCompact);
}

function readTileCullSize(): number {
  if (import.meta.env.DEV) return Math.max(1, Math.floor(devSettings.grass.tileCullSize));
  return Math.max(1, Math.floor(VISUAL.grass.tileCullSize));
}

export function createGrassFieldManager(
  scene: Scene,
  assets: GrassFieldAssets,
  onMeshReplaced?: (root: GrassFieldState['fieldGroup']['root']) => void,
): GrassFieldManager {
  const createRingField = (ringIndex: number): GrassRingField => {
    const layout = readGrassRingsLayout().rings[ringIndex]!;
    const ringUniforms = createGrassRingUniforms(layout);
    const ssbo = new GrassSsbo(
      assets.grassDataMap,
      ringUniforms,
      layout.instanceCount,
      grassBladeIndexCount(layout.segments),
      assets.windAtlas,
      assets.terrainSurfaceHeight.sampleTerrainSurfaceY,
      assets.propExclusionMap,
      layout.bladesPerSide,
      readTileCullSize(),
    );
    return createGrassRingField(
      ringIndex,
      ssbo,
      ringUniforms,
      layout,
      assets.windAtlas,
      assets.sunShadow,
      assets.farSunShadow,
    );
  };

  const createFlowerFieldIfEnabled = (): FlowerField | null => {
    if (!canUseFlowers(assets.flowerSprite)) return null;
    return createFlowerField(
      assets.grassDataMap,
      readFlowerLayout(),
      assets.flowerSprite,
      assets.windAtlas,
      assets.sunShadow,
      assets.terrainSurfaceHeight.sampleTerrainSurfaceY,
      assets.propExclusionMap,
    );
  };

  const ringFields = Array.from({ length: GRASS_RING_COUNT }, (_, i) => createRingField(i));
  const state: GrassFieldState = {
    ringFields,
    fieldGroup: createGrassRingFieldGroup(ringFields),
    flowerField: null,
  };
  scene.add(state.fieldGroup.root);
  registerGrassRingUniforms(state.ringFields.map((f) => f.ringUniforms));

  if (canUseFlowers(assets.flowerSprite)) {
    state.flowerField = createFlowerFieldIfEnabled();
    if (state.flowerField) {
      state.fieldGroup.root.add(state.flowerField.root);
      registerFlowerRingUniforms(state.flowerField.ringUniforms);
    }
  }

  const replaceFieldGroup = (
    nextFields: GrassRingField[],
    nextFlowerField: FlowerField | null,
  ): void => {
    state.fieldGroup.dispose();
    if (state.flowerField) {
      state.fieldGroup.root.remove(state.flowerField.root);
      state.flowerField.dispose();
    }
    scene.remove(state.fieldGroup.root);

    state.ringFields = nextFields;
    state.fieldGroup = createGrassRingFieldGroup(state.ringFields);
    state.flowerField = nextFlowerField;

    if (state.flowerField) {
      state.fieldGroup.root.add(state.flowerField.root);
      registerFlowerRingUniforms(state.flowerField.ringUniforms);
    } else {
      registerFlowerRingUniforms(null);
    }

    scene.add(state.fieldGroup.root);
    registerGrassRingUniforms(state.ringFields.map((f) => f.ringUniforms));
    onMeshReplaced?.(state.fieldGroup.root);
  };

  const bootComputeAll = async (
    renderer: WebGPURenderer,
    fields: GrassRingField[],
    flower: FlowerField | null,
  ): Promise<void> => {
    await Promise.all([
      ...fields.map((field) => runFieldCompactBoot(renderer, field)),
      ...(flower ? [runFieldCompactBoot(renderer, flower)] : []),
    ]);
  };

  return {
    get state() {
      return state;
    },

    async boot(renderer) {
      await bootComputeAll(renderer, state.ringFields, state.flowerField);
    },

    async rebuildAll(renderer) {
      const nextFields = Array.from({ length: GRASS_RING_COUNT }, (_, i) => createRingField(i));
      const nextFlowerField = createFlowerFieldIfEnabled();
      let swapped = false;
      try {
        await bootComputeAll(renderer, nextFields, nextFlowerField);
        replaceFieldGroup(nextFields, nextFlowerField);
        swapped = true;
      } finally {
        if (!swapped) {
          disposeRingFields(nextFields);
          nextFlowerField?.dispose();
        }
      }
    },

    setWorldPosition(x, z) {
      state.fieldGroup.setPosition(x, 0, z);
      if (state.flowerField) {
        state.flowerField.setVisible(flowersEnabled() && state.fieldGroup.root.visible);
      }
    },

    dispose() {
      scene.remove(state.fieldGroup.root);
      if (state.flowerField) {
        state.fieldGroup.root.remove(state.flowerField.root);
        state.flowerField.dispose();
        state.flowerField = null;
      }
      state.fieldGroup.dispose();
    },
  };
}
