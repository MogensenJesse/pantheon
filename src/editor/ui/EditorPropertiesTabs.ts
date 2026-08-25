// src/editor/ui/EditorPropertiesTabs.ts — paint/place sub-mode tabs in the properties panel

import type {
  EditorWorkspaceStore,
  PaintSubMode,
  PlaceSubMode,
} from '../core/EditorWorkspaceStore';

export interface EditorPropertiesTabsHandlers {
  onPlaceSubModeChange: (mode: PlaceSubMode) => void;
  onPaintSubModeChange: (mode: PaintSubMode) => void;
}

export interface EditorPropertiesTabsContext {
  dispose: () => void;
}

const PLACE_TABS: { id: PlaceSubMode; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'brush', label: 'Brush' },
  { id: 'fill', label: 'Fill' },
];

const PAINT_TABS: { id: PaintSubMode; label: string }[] = [
  { id: 'brush', label: 'Brush' },
  { id: 'auto', label: 'Auto' },
];

export function createEditorPropertiesTabs(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: EditorPropertiesTabsHandlers,
): EditorPropertiesTabsContext {
  host.className = 'editor-prop-tabs';
  host.setAttribute('role', 'tablist');

  const placeBtns = new Map<PlaceSubMode, HTMLButtonElement>();
  const paintBtns = new Map<PaintSubMode, HTMLButtonElement>();

  for (const tab of PLACE_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-prop-tab';
    btn.dataset.placeMode = tab.id;
    btn.setAttribute('role', 'tab');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => handlers.onPlaceSubModeChange(tab.id));
    placeBtns.set(tab.id, btn);
    host.appendChild(btn);
  }

  for (const tab of PAINT_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-prop-tab';
    btn.dataset.paintMode = tab.id;
    btn.setAttribute('role', 'tab');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => handlers.onPaintSubModeChange(tab.id));
    paintBtns.set(tab.id, btn);
    host.appendChild(btn);
  }

  const sync = (state: ReturnType<EditorWorkspaceStore['get']>) => {
    const showPlace = state.tool === 'place';
    const showPaint = state.tool === 'paint';
    host.hidden = !showPlace && !showPaint;

    for (const [id, btn] of placeBtns) {
      const visible = showPlace;
      btn.hidden = !visible;
      const active = showPlace && state.placeSubMode === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    }

    for (const [id, btn] of paintBtns) {
      const visible = showPaint;
      btn.hidden = !visible;
      const active = showPaint && state.paintSubMode === id;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    }
  };

  const unsub = store.subscribe(sync);

  return {
    dispose: () => {
      unsub();
      host.replaceChildren();
    },
  };
}
