// src/editor/ui/SculptPropertiesPanel.ts — brush + terrain shape

import type { MapTerrainShape } from '../../map/MapTypes';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import { createEditorShapePanel, type TerrainShapeChangePhase } from './EditorShapePanel';
import { syncEditorRange, wireEditorRange } from './wireEditorRange';

export interface SculptPropertiesPanelHandlers {
  getBrushRadius: () => number;
  getSculptStrength: () => number;
  getSoften: () => boolean;
  onBrushRadius: (radius: number) => void;
  onSculptStrength: (strength: number) => void;
  onSofteningChange: (soften: boolean) => void;
  getTerrainShape: () => MapTerrainShape;
  onTerrainShapeChange: (shape: MapTerrainShape, phase: TerrainShapeChangePhase) => void;
  onTerrainSeedChange: (seed: number) => void;
  onGenerateTerrain: () => void;
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
      <input type="checkbox" id="sculpt-soften" title="Soften ridges (also Alt+LMB)" />
      <span>Soften</span>
    </label>
  `;
  host.appendChild(root);

  const unbind: (() => void)[] = [];
  wireEditorRange(root, 'sculpt-brush-radius', String, handlers.onBrushRadius, unbind);
  wireEditorRange(
    root,
    'sculpt-strength',
    String,
    (v) => handlers.onSculptStrength(v / 100),
    unbind,
  );

  const soften = root.querySelector<HTMLInputElement>('#sculpt-soften')!;
  let softenSticky = handlers.getSoften();
  const syncSoftening = (sticky: boolean, altHeld: boolean) => {
    const active = sticky || altHeld;
    soften.checked = active;
    handlers.onSofteningChange(active);
  };
  soften.checked = softenSticky;
  soften.addEventListener('change', () => {
    softenSticky = soften.checked;
    handlers.onSofteningChange(softenSticky);
  });

  const onAltDown = (e: KeyboardEvent) => {
    if (e.key !== 'Alt' || store.get().tool !== 'sculpt') return;
    syncSoftening(softenSticky, true);
  };
  const onAltUp = (e: KeyboardEvent) => {
    if (e.key !== 'Alt' || store.get().tool !== 'sculpt') return;
    syncSoftening(softenSticky, false);
  };
  window.addEventListener('keydown', onAltDown);
  window.addEventListener('keyup', onAltUp);

  const shape = createEditorShapePanel(
    root,
    {
      getTerrainShape: handlers.getTerrainShape,
      onTerrainShapeChange: handlers.onTerrainShapeChange,
      onTerrainSeedChange: handlers.onTerrainSeedChange,
      onGenerateTerrain: handlers.onGenerateTerrain,
    },
    handlers.getTerrainShape(),
  );

  const unsub = store.subscribe((state) => {
    root.hidden = state.tool !== 'sculpt';
    if (state.tool === 'sculpt') {
      syncEditorRange(root, 'sculpt-brush-radius', handlers.getBrushRadius(), String);
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
