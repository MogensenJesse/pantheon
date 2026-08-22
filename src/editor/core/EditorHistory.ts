// src/editor/core/EditorHistory.ts — undo/redo stacks for map editor state
import type { GridDirtyRegion } from '../../map/authoring/gridDirtyRegion';
import type { MapEntity, MapTerrainShape } from '../../map/MapTypes';
import type { StoredMapEntity } from './EditorEntityStore';
import { isFormFieldTarget } from './editorFormGuards';

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
}

export interface EditorHistoryRecorder {
  beginGesture: () => EditorSnapshot;
  commitGesture: (before: EditorSnapshot, gridRegion?: GridDirtyRegion) => void;
  recordMutation: (fn: () => void) => void;
}

export interface EditorHistoryContext extends EditorHistoryRecorder {
  undo: () => boolean;
  redo: () => boolean;
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
  const { capture, apply, gestureChanged, maxDepth = 50 } = deps;
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  let isApplying = false;
  let unbindKeyboard: (() => void) | null = null;

  const pushUndo = (before: EditorSnapshot) => {
    if (!gestureChanged(before)) return;
    undoStack.push(before);
    if (undoStack.length > maxDepth) undoStack.shift();
    redoStack.length = 0;
  };

  const beginGesture = (): EditorSnapshot => capture();

  const commitGesture = (before: EditorSnapshot, gridRegion?: GridDirtyRegion) => {
    if (isApplying) return;
    if (gridRegion) before.gridRegion = gridRegion;
    else delete before.gridRegion;
    pushUndo(before);
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
    const current = capture();
    current.gridRegion = previous.gridRegion;
    redoStack.push(current);
    isApplying = true;
    try {
      apply(previous);
    } finally {
      isApplying = false;
    }
    return true;
  };

  const redo = (): boolean => {
    if (redoStack.length === 0) return false;
    const next = redoStack.pop()!;
    const current = capture();
    current.gridRegion = next.gridRegion;
    undoStack.push(current);
    isApplying = true;
    try {
      apply(next);
    } finally {
      isApplying = false;
    }
    return true;
  };

  const clear = () => {
    undoStack.length = 0;
    redoStack.length = 0;
  };

  const bindKeyboard = () => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isFormFieldTarget(e.target)) return;

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
    clear,
    bindKeyboard,
    dispose,
  };
}
