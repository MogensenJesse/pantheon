// src/editor/ui/EditorStatusBar.ts — contextual shortcut help + selection/entity counts

import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';

const UNDO_HINT = 'Ctrl+Z undo · Ctrl+Shift+Z redo';
const CAMERA_HINT = 'Space+LMB pan · RMB orbit · wheel zoom';

const HINTS = {
  sculpt: `LMB raise · Shift lower · Alt / Soften smooth ridges · ${UNDO_HINT} · ${CAMERA_HINT}`,
  paintBrush: `Pick a biome · LMB paints · ${UNDO_HINT} · ${CAMERA_HINT}`,
  paintAuto: `Tune rules · Apply biomes reclassifies the map · ${UNDO_HINT} · ${CAMERA_HINT}`,
  placeSingle: `Drag assets onto the map · Click to grab · Shift-click / marquee select · Del remove · ${UNDO_HINT} · ${CAMERA_HINT}`,
  placeBrush: `Shift+click a mix · LMB paint · Shift+LMB erase · ${UNDO_HINT} · ${CAMERA_HINT}`,
  placeFill: `Shift+click a mix · Set density / spacing / weights · Apply replaces biome props · ${UNDO_HINT} · ${CAMERA_HINT}`,
} as const;

export interface EditorStatusBarContext {
  dispose: () => void;
}

export function createEditorStatusBar(
  host: HTMLElement,
  store: EditorWorkspaceStore,
): EditorStatusBarContext {
  host.innerHTML = `
    <p class="editor-status-hint" data-hint></p>
    <div class="editor-status-meta">
      <span data-save></span>
      <span data-selection></span>
      <span data-entities></span>
    </div>
  `;
  const hint = host.querySelector<HTMLElement>('[data-hint]')!;
  const save = host.querySelector<HTMLElement>('[data-save]')!;
  const selection = host.querySelector<HTMLElement>('[data-selection]')!;
  const entities = host.querySelector<HTMLElement>('[data-entities]')!;

  const hintFor = (state: ReturnType<EditorWorkspaceStore['get']>) => {
    if (state.tool === 'sculpt') return HINTS.sculpt;
    if (state.tool === 'paint')
      return state.paintSubMode === 'auto' ? HINTS.paintAuto : HINTS.paintBrush;
    if (state.placeSubMode === 'brush') return HINTS.placeBrush;
    if (state.placeSubMode === 'fill') return HINTS.placeFill;
    return HINTS.placeSingle;
  };

  const unsub = store.subscribe((state) => {
    hint.textContent = hintFor(state);
    save.textContent = state.dirty || !state.mapPersisted ? 'Unsaved' : 'Saved';
    selection.textContent =
      state.tool === 'place' && state.placeSubMode === 'single'
        ? `${state.selectionCount} selected`
        : '';
    entities.textContent = `${state.entityCount.toLocaleString()} props`;
  });

  return { dispose: () => unsub() };
}
