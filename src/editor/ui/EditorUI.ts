// src/editor/ui/EditorUI.ts — toolbar, tool palette, map file actions

import { VISUAL } from '../../config/visualTuning';
import type { MapGrids } from '../../map/MapGrids';
import type { MapFile } from '../../map/MapTypes';
import type { SculptMode } from '../tools/SculptTool';
import { createEditorMapDocument } from './EditorMapDocument';
import { disposeEditorToast, showEditorToast } from './EditorToast';

export type EditorToolId = 'sculpt' | 'paint' | 'place';

export interface EditorUIHandlers {
  onToolChange: (tool: EditorToolId) => void;
  onBrushRadius: (radius: number) => void;
  onBrushHardness: (hardness: number) => void;
  onSculptStrength: (strength: number) => void;
  onRidgeStrength: (ridgeStrength: number) => void;
  onSculptMode: (mode: SculptMode) => void;
  onRidgeFillMountains: () => void;
  onMapSaved?: (map: MapFile) => void;
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; persisted: boolean };
  onMapLoaded: (map: MapFile, grids: MapGrids, persisted?: boolean) => void;
  serializeEntities: () => import('../../map/MapTypes').MapEntity[];
  isDirty?: () => boolean;
}

export interface EditorUIContext {
  setActiveTool: (tool: EditorToolId) => void;
  getActiveTool: () => EditorToolId;
  dispose: () => void;
}

const UNDO_HINT = 'Ctrl+Z undo · Ctrl+Shift+Z redo';

const TOOL_HINTS: Record<EditorToolId, string> = {
  sculpt: `Bulk: LMB raise · Shift lower. Ridge: LMB mountain detail · Shift smooth · Fill mountains: ridge batch · Brush / strength in toolbar · ${UNDO_HINT} · Camera: Space+LMB orbit · RMB pan · wheel zoom`,
  paint: `Pick a biome in the sidebar (including Path) · LMB paints terrain · Brush in toolbar · ${UNDO_HINT} · Camera: Space+LMB orbit · RMB pan · wheel zoom`,
  place: `Drag assets from the sidebar · Click or marquee-select (Shift adds) · Group handles move/rotate/scale · Del remove · ${UNDO_HINT} · Camera: Space+LMB orbit · RMB pan · wheel zoom`,
};

const defaultRidgeStrengthPct = Math.round(VISUAL.editor.ridgeSculpt.strength * 100);

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
        <div id="sculpt-mode-wrap" class="editor-sculpt-modes">
          <button type="button" data-sculpt-mode="bulk" class="active">Bulk</button>
          <button type="button" data-sculpt-mode="ridge">Ridge</button>
        </div>
        <label id="brush-radius-wrap">Brush <input type="range" id="brush-radius" min="2" max="40" value="12" /></label>
        <label id="brush-hardness-wrap" class="hidden">Hardness
          <input type="range" id="brush-hardness" min="0" max="100" value="100" />
        </label>
        <label id="sculpt-strength-wrap">Strength
          <input type="range" id="sculpt-strength" min="1" max="20" value="4" />
        </label>
        <label id="ridge-strength-wrap" class="hidden">Ridge
          <input type="range" id="ridge-strength" min="1" max="20" value="${defaultRidgeStrengthPct}" />
        </label>
        <button type="button" id="btn-ridge-fill" class="hidden editor-ridge-fill">Fill mountains</button>
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
  const brushHardnessWrap = root.querySelector<HTMLLabelElement>('#brush-hardness-wrap')!;
  const brushHardness = root.querySelector<HTMLInputElement>('#brush-hardness')!;
  const sculptStrength = root.querySelector<HTMLInputElement>('#sculpt-strength')!;
  const sculptStrengthWrap = root.querySelector<HTMLLabelElement>('#sculpt-strength-wrap')!;
  const ridgeStrength = root.querySelector<HTMLInputElement>('#ridge-strength')!;
  const ridgeStrengthWrap = root.querySelector<HTMLLabelElement>('#ridge-strength-wrap')!;
  const ridgeFillBtn = root.querySelector<HTMLButtonElement>('#btn-ridge-fill')!;
  const sculptModeWrap = root.querySelector<HTMLDivElement>('#sculpt-mode-wrap')!;
  const sculptModeBtns = sculptModeWrap.querySelectorAll<HTMLButtonElement>('[data-sculpt-mode]');
  const mapList = root.querySelector<HTMLSelectElement>('#map-list')!;

  let activeTool: EditorToolId = 'sculpt';
  let sculptMode: SculptMode = 'bulk';

  const mapDocument = createEditorMapDocument(mapList, {
    getGrids: handlers.getGrids,
    getMapMeta: handlers.getMapMeta,
    onMapLoaded: handlers.onMapLoaded,
    onMapSaved: handlers.onMapSaved,
    serializeEntities: handlers.serializeEntities,
    isDirty: handlers.isDirty,
  });

  const unbindSaveKey = mapDocument.bindKeyboardSave();

  const syncSculptChrome = () => {
    const ridge = sculptMode === 'ridge';
    ridgeStrengthWrap.classList.toggle('hidden', activeTool !== 'sculpt' || !ridge);
    ridgeFillBtn.classList.toggle('hidden', activeTool !== 'sculpt' || !ridge);
    sculptStrengthWrap.classList.toggle('hidden', activeTool !== 'sculpt');
    sculptModeWrap.classList.toggle('hidden', activeTool !== 'sculpt');
  };

  const setActiveTool = (tool: EditorToolId) => {
    activeTool = tool;
    for (const b of toolBtns) {
      b.classList.toggle('active', b.dataset.tool === tool);
    }
    brushRadiusWrap.classList.toggle('hidden', tool === 'place');
    brushHardnessWrap.classList.toggle('hidden', tool !== 'paint');
    syncSculptChrome();
    controlsHint.textContent = TOOL_HINTS[tool];
    handlers.onToolChange(tool);
  };

  toolBtns.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool as EditorToolId));
  });

  brushRadius.addEventListener('input', () => {
    handlers.onBrushRadius(Number(brushRadius.value));
  });

  brushHardness.addEventListener('input', () => {
    handlers.onBrushHardness(Number(brushHardness.value) / 100);
  });

  sculptStrength.addEventListener('input', () => {
    handlers.onSculptStrength(Number(sculptStrength.value) / 100);
  });

  ridgeStrength.addEventListener('input', () => {
    handlers.onRidgeStrength(Number(ridgeStrength.value) / 100);
  });

  sculptModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      sculptMode = btn.dataset.sculptMode as SculptMode;
      for (const b of sculptModeBtns) {
        b.classList.toggle('active', b === btn);
      }
      syncSculptChrome();
      handlers.onSculptMode(sculptMode);
    });
  });

  ridgeFillBtn.addEventListener('click', () => {
    handlers.onRidgeFillMountains();
  });

  root.querySelector('#btn-new')!.addEventListener('click', () => {
    mapDocument.createNewMap();
  });

  root.querySelector('#btn-save')!.addEventListener('click', () => {
    void mapDocument.saveCurrentMap();
  });

  mapList.addEventListener('change', async () => {
    const meta = handlers.getMapMeta();
    const id = mapList.value;
    const currentValue = meta.persisted ? meta.id : '__current__';
    if (id === currentValue) return;
    try {
      const loaded = await mapDocument.loadMapById(id);
      if (!loaded) mapDocument.syncMapListFromMeta();
    } catch (e) {
      showEditorToast(e instanceof Error ? e.message : 'Failed to fetch map', 'error');
      mapDocument.syncMapListFromMeta();
    }
  });

  handlers.onRidgeStrength(Number(ridgeStrength.value) / 100);

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
