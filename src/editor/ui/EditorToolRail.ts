// src/editor/ui/EditorToolRail.ts — Sculpt / Paint / Place and contextual sub-modes

import type {
  EditorToolId,
  EditorWorkspaceStore,
  PaintSubMode,
  PlaceSubMode,
} from '../core/EditorWorkspaceStore';

export interface EditorToolRailHandlers {
  onToolChange: (tool: EditorToolId) => void;
  onPlaceSubModeChange: (mode: PlaceSubMode) => void;
  onPaintSubModeChange: (mode: PaintSubMode) => void;
}

export interface EditorToolRailContext {
  dispose: () => void;
}

export function createEditorToolRail(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: EditorToolRailHandlers,
): EditorToolRailContext {
  host.innerHTML = `
    <div class="editor-tool-rail-group" role="toolbar" aria-label="Editor tools">
      <button type="button" class="editor-tool-btn" data-tool="sculpt" aria-pressed="false">Sculpt</button>
      <button type="button" class="editor-tool-btn" data-tool="paint" aria-pressed="false">Paint</button>
      <button type="button" class="editor-tool-btn" data-tool="place" aria-pressed="false">Place</button>
    </div>
    <div class="editor-tool-rail-group editor-hidden" data-place-modes>
      <button type="button" class="editor-submode-btn" data-place-mode="single" aria-pressed="false">Single</button>
      <button type="button" class="editor-submode-btn" data-place-mode="brush" aria-pressed="false">Brush</button>
      <button type="button" class="editor-submode-btn" data-place-mode="fill" aria-pressed="false">Fill</button>
    </div>
    <div class="editor-tool-rail-group editor-hidden" data-paint-modes>
      <button type="button" class="editor-submode-btn" data-paint-mode="brush" aria-pressed="false">Brush</button>
      <button type="button" class="editor-submode-btn" data-paint-mode="auto" aria-pressed="false">Auto</button>
    </div>
  `;

  const toolBtns = host.querySelectorAll<HTMLButtonElement>('[data-tool]');
  const placeWrap = host.querySelector<HTMLElement>('[data-place-modes]')!;
  const paintWrap = host.querySelector<HTMLElement>('[data-paint-modes]')!;
  const placeBtns = host.querySelectorAll<HTMLButtonElement>('[data-place-mode]');
  const paintBtns = host.querySelectorAll<HTMLButtonElement>('[data-paint-mode]');

  const unsub = store.subscribe((state) => {
    for (const btn of toolBtns) {
      const active = btn.dataset.tool === state.tool;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    placeWrap.classList.toggle('editor-hidden', state.tool !== 'place');
    paintWrap.classList.toggle('editor-hidden', state.tool !== 'paint');
    for (const btn of placeBtns) {
      const active = btn.dataset.placeMode === state.placeSubMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    for (const btn of paintBtns) {
      const active = btn.dataset.paintMode === state.paintSubMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  });

  for (const btn of toolBtns) {
    btn.addEventListener('click', () => handlers.onToolChange(btn.dataset.tool as EditorToolId));
  }
  for (const btn of placeBtns) {
    btn.addEventListener('click', () =>
      handlers.onPlaceSubModeChange(btn.dataset.placeMode as PlaceSubMode),
    );
  }
  for (const btn of paintBtns) {
    btn.addEventListener('click', () =>
      handlers.onPaintSubModeChange(btn.dataset.paintMode as PaintSubMode),
    );
  }

  return { dispose: () => unsub() };
}
