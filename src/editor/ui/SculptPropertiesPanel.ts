// src/editor/ui/SculptPropertiesPanel.ts — brush + optional ridge params

import type { MapTerrainShape } from '../../map/MapTypes';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import { shouldHandleViewportShortcut } from '../core/editorFormGuards';
import { bindEditorRange, syncEditorRangeValue } from './controls/editorRange';
import { createEditorShapePanel } from './EditorShapePanel';

export interface SculptPropertiesPanelHandlers {
  getBrushRadius: () => number;
  getSculptStrength: () => number;
  getSoften: () => boolean;
  getRidge: () => boolean;
  onBrushRadius: (radius: number) => void;
  onSculptStrength: (strength: number) => void;
  onSofteningChange: (soften: boolean) => void;
  onRidgeChange: (ridge: boolean) => void;
  getTerrainShape: () => MapTerrainShape;
  onTerrainShapeChange: (shape: MapTerrainShape) => void;
}

export interface SculptPropertiesPanelContext {
  syncTerrainShape: () => void;
  dispose: () => void;
}

export function createSculptPropertiesPanel(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: SculptPropertiesPanelHandlers,
): SculptPropertiesPanelContext {
  const root = document.createElement('div');
  root.innerHTML = `
    <label class="editor-range">Brush
      <input type="range" id="sculpt-brush-radius" min="2" max="40" value="${handlers.getBrushRadius()}" />
      <output id="sculpt-brush-radius-out">${handlers.getBrushRadius()}</output>
    </label>
    <label class="editor-range">Strength
      <input type="range" id="sculpt-strength" min="1" max="20" value="${Math.round(handlers.getSculptStrength() * 100)}" />
      <output id="sculpt-strength-out">${Math.round(handlers.getSculptStrength() * 100)}</output>
    </label>
    <label class="editor-check">
      <input type="checkbox" id="sculpt-soften" title="Smooth height (also Alt+LMB; exclusive with Ridge)" />
      <span>Soften</span>
    </label>
    <label class="editor-check">
      <input type="checkbox" id="sculpt-ridge" title="Add ridge detail without raising/lowering (cannot combine with Soften)" />
      <span>Ridge</span>
    </label>
  `;
  host.appendChild(root);

  const unbind: (() => void)[] = [];
  unbind.push(
    bindEditorRange(root, 'sculpt-brush-radius', String, { onInput: handlers.onBrushRadius }),
  );
  unbind.push(
    bindEditorRange(root, 'sculpt-strength', String, {
      onInput: (v) => handlers.onSculptStrength(v / 100),
    }),
  );

  const soften = root.querySelector<HTMLInputElement>('#sculpt-soften')!;
  const ridge = root.querySelector<HTMLInputElement>('#sculpt-ridge')!;
  let softenSticky = handlers.getSoften();
  ridge.checked = handlers.getRidge();

  const shape = createEditorShapePanel(
    root,
    {
      getTerrainShape: handlers.getTerrainShape,
      onTerrainShapeChange: handlers.onTerrainShapeChange,
    },
    handlers.getTerrainShape(),
  );
  shape.panel.hidden = !ridge.checked;

  const syncSoftening = (sticky: boolean, altHeld: boolean) => {
    soften.checked = sticky || altHeld;
    // Alt is momentary (read in the sculpt tool). Persist only the checkbox so
    // holding Alt does not permanently clear Ridge via exclusive setOptions.
    handlers.onSofteningChange(sticky);
  };
  soften.checked = softenSticky;
  soften.addEventListener('change', () => {
    softenSticky = soften.checked;
    if (softenSticky) {
      ridge.checked = false;
      handlers.onRidgeChange(false);
      shape.panel.hidden = true;
    }
    handlers.onSofteningChange(softenSticky);
  });

  ridge.addEventListener('change', () => {
    if (ridge.checked) {
      softenSticky = false;
      soften.checked = false;
      handlers.onSofteningChange(false);
    }
    handlers.onRidgeChange(ridge.checked);
    shape.panel.hidden = !ridge.checked;
  });

  const onAltDown = (e: KeyboardEvent) => {
    if (e.key !== 'Alt' || store.get().tool !== 'sculpt') return;
    if (!shouldHandleViewportShortcut(e.target)) return;
    syncSoftening(softenSticky, true);
  };
  const onAltUp = (e: KeyboardEvent) => {
    if (e.key !== 'Alt' || store.get().tool !== 'sculpt') return;
    if (!shouldHandleViewportShortcut(e.target)) return;
    syncSoftening(softenSticky, false);
  };
  window.addEventListener('keydown', onAltDown);
  window.addEventListener('keyup', onAltUp);

  const unsub = store.subscribe((state) => {
    root.hidden = state.tool !== 'sculpt';
    if (state.tool === 'sculpt') {
      syncEditorRangeValue(root, 'sculpt-brush-radius', handlers.getBrushRadius(), String);
    }
  });

  return {
    syncTerrainShape: shape.sync,
    dispose: () => {
      unsub();
      for (const fn of unbind) fn();
      window.removeEventListener('keydown', onAltDown);
      window.removeEventListener('keyup', onAltUp);
      shape.dispose();
      root.remove();
    },
  };
}
