// src/editor/core/EditorWorkspaceStore.ts — shared editor chrome state

export type EditorToolId = 'sculpt' | 'paint' | 'place';
export type PlaceSubMode = 'single' | 'brush' | 'fill';
export type PaintSubMode = 'brush' | 'auto';

export interface EditorWorkspaceState {
  tool: EditorToolId;
  placeSubMode: PlaceSubMode;
  paintSubMode: PaintSubMode;
  mapId: string;
  mapPersisted: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  fogPreview: boolean;
  biomeVis: boolean;
  selectionCount: number;
  entityCount: number;
}

const DEFAULT_STATE: EditorWorkspaceState = {
  tool: 'sculpt',
  placeSubMode: 'single',
  paintSubMode: 'brush',
  mapId: 'new-map',
  mapPersisted: false,
  dirty: false,
  canUndo: false,
  canRedo: false,
  fogPreview: false,
  biomeVis: false,
  selectionCount: 0,
  entityCount: 0,
};

export interface EditorWorkspaceStore {
  get: () => EditorWorkspaceState;
  patch: (partial: Partial<EditorWorkspaceState>) => void;
  subscribe: (listener: (state: EditorWorkspaceState) => void) => () => void;
}

export function createEditorWorkspaceStore(
  initial?: Partial<EditorWorkspaceState>,
): EditorWorkspaceStore {
  let state: EditorWorkspaceState = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set<(state: EditorWorkspaceState) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    get: () => state,
    patch: (partial) => {
      let changed = false;
      const next = { ...state };
      for (const key of Object.keys(partial) as (keyof EditorWorkspaceState)[]) {
        const value = partial[key];
        if (value !== undefined && value !== state[key]) {
          (next[key] as EditorWorkspaceState[typeof key]) = value as never;
          changed = true;
        }
      }
      if (!changed) return;
      state = next;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}

/** True when the current tool has library content (assets or biome cards). */
export function isLibraryAvailable(state: EditorWorkspaceState): boolean {
  if (state.tool === 'place') return true;
  return state.tool === 'paint' && state.paintSubMode === 'brush';
}
