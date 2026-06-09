// src/editor/EditorHistory.ts — undo/redo stacks for map editor state
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

function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  if (a.height.length !== b.height.length || a.biome.length !== b.biome.length) return false;
  for (let i = 0; i < a.height.length; i++) {
    if (a.height[i] !== b.height[i]) return false;
  }
  for (let i = 0; i < a.biome.length; i++) {
    if (a.biome[i] !== b.biome[i]) return false;
  }
  if (a.entities.length !== b.entities.length) return false;
  for (let i = 0; i < a.entities.length; i++) {
    const left = a.entities[i];
    const right = b.entities[i];
    if (left.uid !== right.uid) return false;
    if (JSON.stringify(left.entity) !== JSON.stringify(right.entity)) return false;
  }
  return true;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function createEditorHistory(deps: EditorHistoryDeps): EditorHistoryContext {
  const { capture, apply, maxDepth = 50 } = deps;
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  let isApplying = false;
  let unbindKeyboard: (() => void) | null = null;

  const pushUndo = (before: EditorSnapshot) => {
    const after = capture();
    if (snapshotsEqual(before, after)) return;
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
