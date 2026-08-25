// src/editor/core/EditorHistory.ts — undo/redo stacks for map editor state
import {
  extractFloat32Region,
  extractUint8Region,
  type GridDirtyRegion,
  regionCellCount,
} from '../../map/authoring/gridDirtyRegion';
import type { MapEntity, MapTerrainShape } from '../../map/MapTypes';
import type { StoredMapEntity } from './EditorEntityStore';
import { shouldBlockEditorShortcut } from './editorFormGuards';

export interface EditorSnapshot {
  /** Bumps when height / sculptBase / biome / terrainShape mutate. */
  gridEpoch: number;
  /** Bumps when the entity list mutates. */
  entityEpoch: number;
  height: Float32Array;
  /** Soft sculpt massing envelope; same length as height. */
  sculptBase: Float32Array;
  biome: Uint8Array;
  terrainShape: MapTerrainShape;
  entities: StoredMapEntity[];
  /** When set, apply copies only this AABB (stroke undo). Omit for full-grid restores. */
  gridRegion?: GridDirtyRegion;
  /** True when height/sculptBase/biome store only `gridRegion` cells. */
  packed?: boolean;
}

export interface EditorHistoryRecorder {
  beginGesture: () => EditorSnapshot;
  commitGesture: (before: EditorSnapshot, gridRegion?: GridDirtyRegion) => void;
  recordMutation: (fn: () => void) => void;
}

export interface EditorHistoryContext extends EditorHistoryRecorder {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  subscribe: (listener: () => void) => () => void;
  clear: () => void;
  bindKeyboard: () => () => void;
  dispose: () => void;
}

export interface EditorHistoryDeps {
  capture: () => EditorSnapshot;
  apply: (snap: EditorSnapshot) => void;
  /** True if live state differs from `before` — avoids allocating a throwaway after-snapshot. */
  gestureChanged: (before: EditorSnapshot) => boolean;
  maxDepth?: number;
}

export interface EditorDirtyTracker {
  markClean: () => void;
  isDirty: () => boolean;
}

export interface EditorDirtyPeek {
  gridEpoch: number;
  terrainShape: MapTerrainShape;
  entities: readonly StoredMapEntity[];
}

/** Field-wise MapEntity compare (no JSON.stringify). */
export function mapEntitiesEqual(a: MapEntity, b: MapEntity): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'prop' && b.type === 'prop') {
    return (
      a.key === b.key &&
      a.x === b.x &&
      a.z === b.z &&
      a.rotY === b.rotY &&
      a.scale === b.scale &&
      (a.surfaceLift ?? 0) === (b.surfaceLift ?? 0)
    );
  }
  if (a.type === 'orb' && b.type === 'orb') {
    return a.x === b.x && a.z === b.z && (a.energy ?? 0) === (b.energy ?? 0);
  }
  if (a.type === 'playerStart' && b.type === 'playerStart') {
    return a.x === b.x && a.z === b.z && a.rotY === b.rotY;
  }
  return false;
}

export function terrainShapesEqual(a: MapTerrainShape, b: MapTerrainShape): boolean {
  return (
    a.seed === b.seed &&
    a.heightScale === b.heightScale &&
    a.frequency === b.frequency &&
    a.octaves === b.octaves &&
    a.erosion === b.erosion &&
    a.warp === b.warp &&
    a.valleyBias === b.valleyBias &&
    a.seaLevel === b.seaLevel &&
    a.talus === b.talus &&
    a.talusPasses === b.talusPasses
  );
}

export function storedEntitiesEqual(
  a: readonly StoredMapEntity[],
  b: readonly StoredMapEntity[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.uid !== right.uid) return false;
    if (!mapEntitiesEqual(left.entity, right.entity)) return false;
  }
  return true;
}

/**
 * Dirty check without allocating full grid copies.
 * Baseline stores epoch + shape + entities; peek reads live state.
 */
export function createEditorDirtyTracker(peek: () => EditorDirtyPeek): EditorDirtyTracker {
  let baseline: EditorDirtyPeek | null = null;

  return {
    markClean: () => {
      const live = peek();
      baseline = {
        gridEpoch: live.gridEpoch,
        terrainShape: { ...live.terrainShape },
        entities: live.entities.map(({ uid, entity }) => ({
          uid,
          entity: structuredClone(entity),
        })),
      };
    },
    isDirty: () => {
      if (baseline === null) return false;
      const live = peek();
      if (live.gridEpoch !== baseline.gridEpoch) return true;
      if (!terrainShapesEqual(live.terrainShape, baseline.terrainShape)) return true;
      return !storedEntitiesEqual(live.entities, baseline.entities);
    },
  };
}

export function createEditorHistory(deps: EditorHistoryDeps): EditorHistoryContext {
  const { capture, apply, gestureChanged, maxDepth = 24 } = deps;
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  const listeners = new Set<() => void>();
  let isApplying = false;
  let unbindKeyboard: (() => void) | null = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const packSnapshot = (
    snap: EditorSnapshot,
    region: GridDirtyRegion | undefined,
  ): EditorSnapshot => {
    if (!region || snap.packed) {
      return region ? { ...snap, gridRegion: region } : snap;
    }
    const gridSize = Math.round(Math.sqrt(snap.height.length));
    if (gridSize * gridSize !== snap.height.length) return { ...snap, gridRegion: region };
    if (snap.height.length === regionCellCount(region)) {
      return { ...snap, gridRegion: region, packed: true };
    }
    return {
      ...snap,
      gridRegion: region,
      packed: true,
      height: extractFloat32Region(snap.height, region, gridSize),
      sculptBase: extractFloat32Region(snap.sculptBase, region, gridSize),
      biome: extractUint8Region(snap.biome, region, gridSize),
    };
  };

  const pushUndo = (before: EditorSnapshot) => {
    if (!gestureChanged(before)) return;
    undoStack.push(before);
    if (undoStack.length > maxDepth) undoStack.shift();
    redoStack.length = 0;
    emit();
  };

  const beginGesture = (): EditorSnapshot => capture();

  const commitGesture = (before: EditorSnapshot, gridRegion?: GridDirtyRegion) => {
    if (isApplying) return;
    pushUndo(packSnapshot(before, gridRegion));
  };

  const recordMutation = (fn: () => void) => {
    if (isApplying) {
      fn();
      return;
    }
    const before = capture();
    fn();
    pushUndo(before);
  };

  const undo = (): boolean => {
    if (undoStack.length === 0) return false;
    const previous = undoStack.pop()!;
    const current = packSnapshot(capture(), previous.gridRegion);
    redoStack.push(current);
    isApplying = true;
    try {
      apply(previous);
    } finally {
      isApplying = false;
    }
    emit();
    return true;
  };

  const redo = (): boolean => {
    if (redoStack.length === 0) return false;
    const next = redoStack.pop()!;
    const current = packSnapshot(capture(), next.gridRegion);
    undoStack.push(current);
    isApplying = true;
    try {
      apply(next);
    } finally {
      isApplying = false;
    }
    emit();
    return true;
  };

  const clear = () => {
    if (undoStack.length === 0 && redoStack.length === 0) return;
    undoStack.length = 0;
    redoStack.length = 0;
    emit();
  };

  const bindKeyboard = () => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (shouldBlockEditorShortcut(e.target)) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (undo()) e.preventDefault();
        return;
      }
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        if (redo()) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    unbindKeyboard = () => window.removeEventListener('keydown', onKeyDown);
    return unbindKeyboard;
  };

  const dispose = () => {
    unbindKeyboard?.();
    unbindKeyboard = null;
    clear();
  };

  return {
    beginGesture,
    commitGesture,
    recordMutation,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    subscribe: (listener) => {
      listeners.add(listener);
      listener();
      return () => listeners.delete(listener);
    },
    clear,
    bindKeyboard,
    dispose,
  };
}
