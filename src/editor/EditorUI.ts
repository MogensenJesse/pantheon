// src/editor/EditorUI.ts — toolbar, tool palette, map file actions

import type { MapGrids } from '../map/MapGrids';
import type { MapFile } from '../map/MapTypes';
import { createEditorMapDocument } from './EditorMapDocument';
import { disposeEditorToast, showEditorToast } from './editorToast';

export type EditorToolId = 'sculpt' | 'paint' | 'place';

export interface EditorUIHandlers {
  onToolChange: (tool: EditorToolId) => void;
  onBrushRadius: (radius: number) => void;
  onSculptStrength: (strength: number) => void;
  onMapSaved?: (map: MapFile) => void;
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; persisted: boolean };
  onMapLoaded: (map: MapFile, grids: MapGrids, persisted?: boolean) => void;
  serializeEntities: () => import('../map/MapTypes').MapEntity[];
}

export interface EditorUIContext {
  setActiveTool: (tool: EditorToolId) => void;
  getActiveTool: () => EditorToolId;
  dispose: () => void;
}

const TOOL_HINTS: Record<EditorToolId, string> = {
  sculpt:
    'LMB sculpts terrain · Brush / strength in toolbar · Camera: Space+LMB orbit · RMB pan · wheel zoom',
  paint:
    'Pick a biome in the sidebar (including Path) · LMB paints terrain · Brush in toolbar · Camera: Space+LMB orbit · RMB pan · wheel zoom',
  place:
    'Drag assets from the sidebar · Click or marquee-select (Shift adds) · Group handles move/rotate/scale · Del remove · Camera: Space+LMB orbit · RMB pan · wheel zoom',
};

export function initEditorUI(handlers: EditorUIHandlers): EditorUIContext {
  const root = document.createElement('div');
  root.id = 'editor-ui';
  root.innerHTML = `
    <div class="editor-bar">
      <div class="editor-bar-left">
        <span class="editor-title">Map Editor</span>
        <div class="editor-tools">
          <button type="button" data-tool="sculpt" class="active">Sculpt</button>
          <button type="button" data-tool="paint">Paint</button>
          <button type="button" data-tool="place">Place</button>
        </div>
        <label id="brush-radius-wrap">Brush <input type="range" id="brush-radius" min="2" max="40" value="12" /></label>
        <label id="sculpt-strength-wrap">Strength
          <input type="range" id="sculpt-strength" min="1" max="20" value="4" />
        </label>
      </div>
      <div class="editor-file">
        <button type="button" id="btn-new">New</button>
        <select id="map-list"></select>
        <button type="button" id="btn-save" title="Save (Ctrl+S)">Save</button>
      </div>
    </div>
  `;

  const controlsHint = document.createElement('p');
  controlsHint.id = 'editor-controls-hint';
  controlsHint.className = 'editor-hint';
  controlsHint.textContent = TOOL_HINTS.sculpt;

  document.body.appendChild(root);
  document.body.appendChild(controlsHint);

  const editorBar = root.querySelector('.editor-bar') as HTMLElement;

  const syncChromeHeight = () => {
    document.documentElement.style.setProperty(
      '--editor-chrome-height',
      `${editorBar.offsetHeight}px`,
    );
  };
  syncChromeHeight();
  window.addEventListener('resize', syncChromeHeight);

  const toolBtns = root.querySelectorAll<HTMLButtonElement>('[data-tool]');
  const brushRadiusWrap = root.querySelector<HTMLLabelElement>('#brush-radius-wrap')!;
  const brushRadius = root.querySelector<HTMLInputElement>('#brush-radius')!;
  const sculptStrength = root.querySelector<HTMLInputElement>('#sculpt-strength')!;
  const sculptStrengthWrap = root.querySelector<HTMLLabelElement>('#sculpt-strength-wrap')!;
  const mapList = root.querySelector<HTMLSelectElement>('#map-list')!;

  let activeTool: EditorToolId = 'sculpt';

  const mapDocument = createEditorMapDocument(mapList, {
    getGrids: handlers.getGrids,
    getMapMeta: handlers.getMapMeta,
    onMapLoaded: handlers.onMapLoaded,
    onMapSaved: handlers.onMapSaved,
    serializeEntities: handlers.serializeEntities,
  });

  const unbindSaveKey = mapDocument.bindKeyboardSave();

  const setActiveTool = (tool: EditorToolId) => {
    activeTool = tool;
    for (const b of toolBtns) {
      b.classList.toggle('active', b.dataset.tool === tool);
    }
    sculptStrengthWrap.classList.toggle('hidden', tool !== 'sculpt');
    brushRadiusWrap.classList.toggle('hidden', tool === 'place');
    controlsHint.textContent = TOOL_HINTS[tool];
    handlers.onToolChange(tool);
  };

  toolBtns.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool as EditorToolId));
  });

  brushRadius.addEventListener('input', () => {
    handlers.onBrushRadius(Number(brushRadius.value));
  });

  sculptStrength.addEventListener('input', () => {
    handlers.onSculptStrength(Number(sculptStrength.value) / 100);
  });

  root.querySelector('#btn-new')!.addEventListener('click', () => mapDocument.createNewMap());

  root.querySelector('#btn-save')!.addEventListener('click', () => {
    void mapDocument.saveCurrentMap();
  });

  mapList.addEventListener('change', async () => {
    const meta = handlers.getMapMeta();
    const id = mapList.value;
    const currentValue = meta.persisted ? meta.id : '__current__';
    if (id === currentValue) return;
    try {
      await mapDocument.loadMapById(id);
    } catch (e) {
      showEditorToast(e instanceof Error ? e.message : 'Failed to fetch map', 'error');
      mapDocument.syncMapListFromMeta();
    }
  });

  return {
    setActiveTool,
    getActiveTool: () => activeTool,
    dispose: () => {
      unbindSaveKey();
      window.removeEventListener('resize', syncChromeHeight);
      disposeEditorToast();
      mapDocument.dispose();
      controlsHint.remove();
      root.remove();
    },
  };
}
