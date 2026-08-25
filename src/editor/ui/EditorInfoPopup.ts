// src/editor/ui/EditorInfoPopup.ts — contextual hints + stats behind tool-rail info button

import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import { createInfoToolIcon } from './editorToolIcons';

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

export interface EditorInfoPopupContext {
  dispose: () => void;
}

export function createEditorInfoPopup(
  railHost: HTMLElement,
  store: EditorWorkspaceStore,
): EditorInfoPopupContext {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'editor-tool-icon-btn editor-info-btn';
  toggle.setAttribute('aria-label', 'Editor hints and status');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'editor-info-popup');
  toggle.appendChild(createInfoToolIcon());

  const popup = document.createElement('div');
  popup.id = 'editor-info-popup';
  popup.className = 'editor-info-popup';
  popup.hidden = true;
  popup.innerHTML = `
    <p class="editor-info-hint" data-hint></p>
    <div class="editor-info-meta" aria-live="polite">
      <span data-save></span>
      <span data-selection></span>
      <span data-entities></span>
    </div>
  `;

  const hint = popup.querySelector<HTMLElement>('[data-hint]')!;
  const save = popup.querySelector<HTMLElement>('[data-save]')!;
  const selection = popup.querySelector<HTMLElement>('[data-selection]')!;
  const entities = popup.querySelector<HTMLElement>('[data-entities]')!;

  railHost.appendChild(toggle);
  document.body.appendChild(popup);

  let open = false;

  const hintFor = (state: ReturnType<EditorWorkspaceStore['get']>) => {
    if (state.tool === 'sculpt') return HINTS.sculpt;
    if (state.tool === 'paint')
      return state.paintSubMode === 'auto' ? HINTS.paintAuto : HINTS.paintBrush;
    if (state.placeSubMode === 'brush') return HINTS.placeBrush;
    if (state.placeSubMode === 'fill') return HINTS.placeFill;
    return HINTS.placeSingle;
  };

  const positionPopup = () => {
    const railRect = railHost.getBoundingClientRect();
    popup.style.left = `${railRect.right + 8}px`;
    popup.style.bottom = `${Math.max(12, window.innerHeight - railRect.bottom + 8)}px`;
  };

  const setOpen = (next: boolean) => {
    open = next;
    popup.hidden = !open;
    toggle.classList.toggle('is-active', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) positionPopup();
  };

  const onToggleClick = (event: MouseEvent) => {
    event.stopPropagation();
    setOpen(!open);
  };

  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!open) return;
    const target = event.target as Node;
    if (popup.contains(target) || toggle.contains(target)) return;
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) setOpen(false);
  };

  const onResize = () => {
    if (open) positionPopup();
  };

  toggle.addEventListener('click', onToggleClick);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  const unsub = store.subscribe((state) => {
    hint.textContent = hintFor(state);
    save.textContent = state.dirty || !state.mapPersisted ? 'Unsaved' : 'Saved';
    selection.textContent =
      state.tool === 'place' && state.placeSubMode === 'single'
        ? `${state.selectionCount} selected`
        : '';
    entities.textContent = `${state.entityCount.toLocaleString()} props`;
  });

  return {
    dispose: () => {
      unsub();
      toggle.removeEventListener('click', onToggleClick);
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      toggle.remove();
      popup.remove();
    },
  };
}
