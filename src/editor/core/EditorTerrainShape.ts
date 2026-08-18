// src/editor/core/EditorTerrainShape.ts — Quilez derive, talus debounce, sculpt-base bake
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import {
  bakeSculptBaseFromHeight,
  deriveShapedHeight,
  QuilezFieldCache,
  resolveTerrainNoiseSeed,
} from '../../map/authoring/deriveShapedHeight';
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import type { MapGrids } from '../../map/MapGrids';
import type { MapTerrainShape } from '../../map/MapTypes';
import type { SculptFlushQuality } from '../tools/SculptTool';

const SHAPE_REBUILD_DEBOUNCE_MS = 80;

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
  derive: (quality?: SculptFlushQuality, region?: GridDirtyRegion) => void;
  bakeSoften: (region?: GridDirtyRegion) => void;
  schedulePreview: () => void;
  flushFinal: () => void;
  generate: () => void;
  warmCache: () => void;
  dispose: () => void;
}

export function createEditorTerrainShape(deps: EditorTerrainShapeDeps): EditorTerrainShapeContext {
  const { grids, sculptBase, getMapId, applyHeights, bumpGridEpoch } = deps;
  let terrainShape: MapTerrainShape = defaultTerrainShape();
  const quilezCache = new QuilezFieldCache();
  let rebuildTimer = 0;

  const fieldForCurrent = () => {
    const noiseSeed = resolveTerrainNoiseSeed(terrainShape, getMapId());
    return {
      noiseSeed,
      quilezField: quilezCache.get(grids.size, WORLD.SIZE, noiseSeed, terrainShape),
    };
  };

  const derive = (quality: SculptFlushQuality = 'final', region?: GridDirtyRegion) => {
    bumpGridEpoch();
    const { noiseSeed, quilezField } = fieldForCurrent();
    deriveShapedHeight(sculptBase, grids.height, grids.size, {
      worldSize: WORLD.SIZE,
      heightScaleWorld: WORLD.HEIGHT_SCALE,
      noiseSeed,
      shape: terrainShape,
      quilezField,
      skipTalus: quality === 'preview',
      region,
    });
    applyHeights(region);
  };

  const bakeSoften = (region?: GridDirtyRegion) => {
    bumpGridEpoch();
    const { quilezField } = fieldForCurrent();
    bakeSculptBaseFromHeight(
      grids.height,
      sculptBase,
      quilezField,
      grids.size,
      terrainShape,
      region,
    );
    applyHeights(region);
  };

  const schedulePreview = () => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = 0;
      derive('preview');
    }, SHAPE_REBUILD_DEBOUNCE_MS);
  };

  const flushFinal = () => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = 0;
    derive('final');
  };

  return {
    getShape: () => terrainShape,
    setShape: (shape) => {
      terrainShape = cloneTerrainShape(shape);
    },
    derive,
    bakeSoften,
    schedulePreview,
    flushFinal,
    generate: () => {
      sculptBase.fill(1);
      quilezCache.invalidate();
      derive('final');
    },
    warmCache: () => {
      fieldForCurrent();
    },
    dispose: () => {
      window.clearTimeout(rebuildTimer);
      rebuildTimer = 0;
    },
  };
}
