// src/editor/core/EditorTerrainShape.ts — ridge sampler + sculpt-base bake
import { VISUAL } from '../../config/visualTuning';
import { resolveTerrainNoiseSeed } from '../../map/authoring/deriveShapedHeight';
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import { createQuilezHeightSampler } from '../../map/authoring/quilezHeightField';
import type { MapGrids } from '../../map/MapGrids';
import type { MapTerrainShape } from '../../map/MapTypes';

export function cloneTerrainShape(shape: MapTerrainShape): MapTerrainShape {
  return { ...shape };
}

export function defaultTerrainShape(): MapTerrainShape {
  return cloneTerrainShape(VISUAL.editor.terrainShape);
}

export interface EditorTerrainShapeDeps {
  grids: MapGrids;
  sculptBase: Float32Array;
  getMapId: () => string;
  applyHeights: (region?: GridDirtyRegion) => void;
  bumpGridEpoch: () => void;
}

export interface EditorTerrainShapeContext {
  getShape: () => MapTerrainShape;
  setShape: (shape: MapTerrainShape) => void;
  sampleRidge: (worldX: number, worldZ: number) => number;
  bakeSoften: (region?: GridDirtyRegion) => void;
  invertFromDisplayHeight: () => void;
  dispose: () => void;
}

export function createEditorTerrainShape(deps: EditorTerrainShapeDeps): EditorTerrainShapeContext {
  const { grids, sculptBase, getMapId, applyHeights, bumpGridEpoch } = deps;
  let terrainShape: MapTerrainShape = defaultTerrainShape();
  let ridgeSampler: ((worldX: number, worldZ: number) => number) | null = null;

  const ensureRidgeSampler = () => {
    if (ridgeSampler) return ridgeSampler;
    const noiseSeed = resolveTerrainNoiseSeed(terrainShape, getMapId());
    ridgeSampler = createQuilezHeightSampler({
      seed: noiseSeed,
      frequency: terrainShape.frequency,
      octaves: Math.max(1, Math.floor(terrainShape.octaves)),
      erosion: terrainShape.erosion,
      warp: terrainShape.warp,
      valleyBias: terrainShape.valleyBias,
    });
    return ridgeSampler;
  };

  const copyHeightToBase = (region?: GridDirtyRegion) => {
    if (!region) {
      sculptBase.set(grids.height);
      return;
    }
    const N = grids.size;
    const i0 = Math.max(0, region.iMin);
    const i1 = Math.min(N - 1, region.iMax);
    const j0 = Math.max(0, region.jMin);
    const j1 = Math.min(N - 1, region.jMax);
    for (let j = j0; j <= j1; j++) {
      const row = j * N;
      for (let i = i0; i <= i1; i++) {
        const idx = row + i;
        sculptBase[idx] = grids.height[idx]!;
      }
    }
  };

  return {
    getShape: () => terrainShape,
    setShape: (shape) => {
      terrainShape = cloneTerrainShape(shape);
      ridgeSampler = null;
    },
    sampleRidge: (worldX, worldZ) => ensureRidgeSampler()(worldX, worldZ),
    bakeSoften: (region) => {
      bumpGridEpoch();
      copyHeightToBase(region);
      applyHeights(region);
    },
    invertFromDisplayHeight: () => {
      sculptBase.set(grids.height);
    },
    dispose: () => {
      ridgeSampler = null;
    },
  };
}
