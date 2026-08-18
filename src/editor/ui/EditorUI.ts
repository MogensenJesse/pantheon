// src/editor/ui/EditorUI.ts — toolbar, tool palette, map file actions, terrain shape panel

import { bindRange, syncSlider } from '../../dev/bindRange';
import type { MapGrids } from '../../map/MapGrids';
import type { MapFile, MapTerrainShape } from '../../map/MapTypes';
import { createEditorMapDocument } from './EditorMapDocument';
import { createEditorShapePanel, type TerrainShapeChangePhase } from './EditorShapePanel';
import { disposeEditorToast, showEditorToast } from './EditorToast';

export type EditorToolId = 'sculpt' | 'paint' | 'place';
export type PlaceSubMode = 'single' | 'brush';

export type { TerrainShapeChangePhase };

export interface EditorUIHandlers {
  onToolChange: (tool: EditorToolId) => void;
  onPlaceSubModeChange?: (mode: PlaceSubMode) => void;
  onBrushRadius: (radius: number) => void;
  onBrushHardness: (hardness: number) => void;
  onSculptStrength: (strength: number) => void;
  /** Sticky soften mode (also active while Alt is held). */
  onSofteningChange: (soften: boolean) => void;
  /** Live TerrainGenerator-style shape params. */
  onTerrainShapeChange: (shape: MapTerrainShape, phase: TerrainShapeChangePhase) => void;
  /** Seed only — stored for Generate; does not re-derive live. */
  onTerrainSeedChange: (seed: number) => void;
  /** Fill sculpt base with full envelope and derive Quilez terrain for current seed. */
  onGenerateTerrain: () => void;
  getTerrainShape: () => MapTerrainShape;
  onFogPreviewChange: (enabled: boolean) => void;
  onMapSaved?: (map: MapFile) => void;
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; persisted: boolean };
  getHeightBase: () => Float32Array;
  onMapLoaded: (map: MapFile, grids: MapGrids, persisted?: boolean) => void;
  serializeEntities: () => import('../../map/MapTypes').MapEntity[];
  isDirty?: () => boolean;
}

export interface EditorUIContext {
  setActiveTool: (tool: EditorToolId) => void;
  getActiveTool: () => EditorToolId;
  getPlaceSubMode: () => PlaceSubMode;
  /** Sync shape panel sliders from session (e.g. after map load). */
  syncTerrainShapePanel: () => void;
  dispose: () => void;
}

const UNDO_HINT = 'Ctrl+Z undo · Ctrl+Shift+Z redo';

const CAMERA_HINT = 'Camera: Space+LMB pan · RMB orbit · wheel zoom';

const TOOL_HINTS: Record<'sculpt' | 'paint', string> = {
  sculpt: `LMB raise · Shift lower · Alt / Soften smooth ridges · Shape panel derives · ${UNDO_HINT} · ${CAMERA_HINT}`,
  paint: `Pick a biome in the sidebar (including Path) · LMB paints terrain · Brush in toolbar · ${UNDO_HINT} · ${CAMERA_HINT}`,
};

const PLACE_SUB_HINTS: Record<PlaceSubMode, string> = {
  single: `Drag assets from the sidebar · Placement options in sidebar · Click or marquee-select (Shift adds) · Group handles move/rotate/scale · Del remove · ${UNDO_HINT} · ${CAMERA_HINT}`,
  brush: `Shift+click assets to build a mix · LMB paint · Shift+LMB erase · Brush radius in toolbar · Options in sidebar · ${UNDO_HINT} · ${CAMERA_HINT}`,
};

export function initEditorUI(handlers: EditorUIHandlers): EditorUIContext {
  const initialShape = handlers.getTerrainShape();

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
        <div id="place-mode-wrap" class="editor-place-modes hidden">
          <button type="button" data-place-mode="single" class="active">Single</button>
          <button type="button" data-place-mode="brush">Brush</button>
        </div>
        <label id="brush-radius-wrap">Brush <input type="range" id="brush-radius" min="2" max="40" value="12" /></label>
        <label id="brush-hardness-wrap" class="hidden">Hardness
          <input type="range" id="brush-hardness" min="0" max="100" value="100" />
        </label>
        <label id="sculpt-strength-wrap">Strength
          <input type="range" id="sculpt-strength" min="1" max="20" value="4" />
        </label>
        <label id="sculpt-soften-wrap" class="editor-fog-toggle">
          <span>Soften</span>
          <input type="checkbox" id="sculpt-soften" title="Soften ridges (also Alt+LMB)" />
        </label>
        <label id="editor-fog-wrap" class="editor-fog-toggle">
          <span>Fog</span>
          <input type="checkbox" id="editor-fog-enabled" />
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
  const shapePanel = createEditorShapePanel(
    root,
    {
      getTerrainShape: handlers.getTerrainShape,
      onTerrainShapeChange: handlers.onTerrainShapeChange,
      onTerrainSeedChange: handlers.onTerrainSeedChange,
      onGenerateTerrain: handlers.onGenerateTerrain,
    },
    initialShape,
  );

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
  const brushHardnessWrap = root.querySelector<HTMLLabelElement>('#brush-hardness-wrap')!;
  const sculptStrengthWrap = root.querySelector<HTMLLabelElement>('#sculpt-strength-wrap')!;
  const sculptSoftenWrap = root.querySelector<HTMLLabelElement>('#sculpt-soften-wrap')!;
  const softenCheckbox = root.querySelector<HTMLInputElement>('#sculpt-soften')!;
  const placeModeWrap = root.querySelector<HTMLDivElement>('#place-mode-wrap')!;
  const placeModeBtns = placeModeWrap.querySelectorAll<HTMLButtonElement>('[data-place-mode]');
  const mapList = root.querySelector<HTMLSelectElement>('#map-list')!;

  const unbindRanges: (() => void)[] = [];

  const wireToolbarRange = (
    id: string,
    format: (v: number) => string,
    onInput: (v: number) => void,
  ) => {
    const outId = `${id}-out`;
    const slider = root.querySelector(`#${id}`) as HTMLInputElement;
    const value = Number(slider.value);
    syncSlider(root, id, outId, value, format);
    onInput(value);
    unbindRanges.push(bindRange(root, id, outId, format, onInput));
  };

  let activeTool: EditorToolId = 'sculpt';
  let placeSubMode: PlaceSubMode = 'single';
  /** Sticky Soften checkbox; Alt temporarily forces soften without clearing sticky. */
  let softenSticky = false;

  const mapDocument = createEditorMapDocument(mapList, {
    getGrids: handlers.getGrids,
    getMapMeta: handlers.getMapMeta,
    getHeightBase: handlers.getHeightBase,
    getTerrainShape: handlers.getTerrainShape,
    onMapLoaded: handlers.onMapLoaded,
    onMapSaved: handlers.onMapSaved,
    serializeEntities: handlers.serializeEntities,
    isDirty: handlers.isDirty,
  });

  const unbindSaveKey = mapDocument.bindKeyboardSave();

  const syncPlaceChrome = () => {
    const isPlace = activeTool === 'place';
    const isBrush = isPlace && placeSubMode === 'brush';

    placeModeWrap.classList.toggle('hidden', !isPlace);
    brushRadiusWrap.classList.toggle('hidden', isPlace && !isBrush);

    if (isPlace) {
      controlsHint.textContent = PLACE_SUB_HINTS[placeSubMode];
    }
  };

  const setPlaceSubMode = (mode: PlaceSubMode) => {
    placeSubMode = mode;
    for (const b of placeModeBtns) {
      b.classList.toggle('active', b.dataset.placeMode === mode);
    }
    syncPlaceChrome();
    handlers.onPlaceSubModeChange?.(mode);
  };

  const syncSculptChrome = () => {
    const sculpt = activeTool === 'sculpt';
    sculptStrengthWrap.classList.toggle('hidden', !sculpt);
    sculptSoftenWrap.classList.toggle('hidden', !sculpt);
    shapePanel.setHidden(!sculpt);
  };

  const setActiveTool = (tool: EditorToolId) => {
    activeTool = tool;
    for (const b of toolBtns) {
      b.classList.toggle('active', b.dataset.tool === tool);
    }
    brushHardnessWrap.classList.toggle('hidden', tool !== 'paint');
    syncSculptChrome();
    syncPlaceChrome();
    if (tool !== 'place') {
      controlsHint.textContent = TOOL_HINTS[tool];
    }
    handlers.onToolChange(tool);
  };

  placeModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setPlaceSubMode(btn.dataset.placeMode as PlaceSubMode));
  });

  toolBtns.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool as EditorToolId));
  });

  wireToolbarRange('brush-radius', String, handlers.onBrushRadius);
  wireToolbarRange(
    'brush-hardness',
    (v) => `${v}%`,
    (v) => handlers.onBrushHardness(v / 100),
  );
  wireToolbarRange(
    'sculpt-strength',
    (v) => `${v}`,
    (v) => handlers.onSculptStrength(v / 100),
  );

  const syncSoftening = (sticky: boolean, altHeld: boolean) => {
    const active = sticky || altHeld;
    softenCheckbox.checked = active;
    handlers.onSofteningChange(active);
  };

  softenCheckbox.addEventListener('change', () => {
    softenSticky = softenCheckbox.checked;
    handlers.onSofteningChange(softenSticky);
  });

  const onAltKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Alt') return;
    syncSoftening(softenSticky, true);
  };
  const onAltKeyUp = (e: KeyboardEvent) => {
    if (e.key !== 'Alt') return;
    syncSoftening(softenSticky, false);
  };
  window.addEventListener('keydown', onAltKeyDown);
  window.addEventListener('keyup', onAltKeyUp);

  const fogCheckbox = root.querySelector('#editor-fog-enabled') as HTMLInputElement;
  fogCheckbox.addEventListener('change', () => {
    handlers.onFogPreviewChange(fogCheckbox.checked);
  });
  handlers.onFogPreviewChange(fogCheckbox.checked);

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

  syncSculptChrome();

  return {
    setActiveTool,
    getActiveTool: () => activeTool,
    getPlaceSubMode: () => placeSubMode,
    syncTerrainShapePanel: shapePanel.sync,
    dispose: () => {
      for (const unbind of unbindRanges) unbind();
      unbindSaveKey();
      mapDocument.dispose();
      shapePanel.dispose();
      window.removeEventListener('resize', syncChromeHeight);
      window.removeEventListener('keydown', onAltKeyDown);
      window.removeEventListener('keyup', onAltKeyUp);
      disposeEditorToast();
      controlsHint.remove();
      root.remove();
    },
  };
}
