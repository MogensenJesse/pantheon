// src/editor/core/EditorHistory.ts — undo/redo stacks for map editor state
import type { MapEntity } from '../../map/MapTypes';
import type { StoredMapEntity } from './EditorEntityStore';

export interface EditorSnapshot {
  height: Float32Array;
  biome: Uint8Array;
  entities: StoredMapEntity[];
}

export interface EditorHistoryRecorder {
  beginGesture: () => EditorSnapshot;
  commitGesture: (before: EditorSnapshot) => void;
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
  maxDepth?: number;
}

export interface EditorDirtyTracker {
  markClean: () => void;
  isDirty: () => boolean;
}

export function entityJson(entity: MapEntity): string {
  return JSON.stringify(entity);
}

export function typedGridBuffersEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function editorSnapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  if (!typedGridBuffersEqual(a.height, b.height)) return false;
  if (!typedGridBuffersEqual(a.biome, b.biome)) return false;
  return storedEntitiesEqual(a.entities, b.entities);
}

export function storedEntitiesEqual(
  a: readonly StoredMapEntity[],
  b: readonly StoredMapEntity[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.uid !== right.uid) return false;
    if (entityJson(left.entity) !== entityJson(right.entity)) return false;
  }
  return true;
}

export function createEditorDirtyTracker(capture: () => EditorSnapshot): EditorDirtyTracker {
  let baseline: EditorSnapshot | null = null;

  return {
    markClean: () => {
      baseline = capture();
    },
    isDirty: () => baseline !== null && !editorSnapshotsEqual(baseline, capture()),
  };
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export { isFormFieldTarget };

export function createEditorHistory(deps: EditorHistoryDeps): EditorHistoryContext {
  const { capture, apply, maxDepth = 50 } = deps;
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  let isApplying = false;
  let unbindKeyboard: (() => void) | null = null;

  const pushUndo = (before: EditorSnapshot) => {
    const after = capture();
    if (editorSnapshotsEqual(before, after)) return;
    undoStack.push(before);
    if (undoStack.length > maxDepth) undoStack.shift();
    redoStack.length = 0;
  };

  const beginGesture = (): EditorSnapshot => capture();

  const commitGesture = (before: EditorSnapshot) => {
    if (isApplying) return;
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
    redoStack.push(capture());
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
    undoStack.push(capture());
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
