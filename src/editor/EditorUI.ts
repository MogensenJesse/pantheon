// src/editor/EditorUI.ts — toolbar, tool palette, map file actions
import type { MapFile } from '../map/MapTypes';
import {
  isValidMapId,
  normalizeMapId,
} from '../map/MapTypes';
import {
  createNewMapFile,
  downloadMapFile,
  fetchMapById,
  fetchMapManifest,
  getMapEntities,
  gridsToMapFile,
  mapFileToGrids,
  saveMapToProject,
} from '../map/MapIO';
import type { MapGrids } from '../map/MapGrids';
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
    document.documentElement.style.setProperty('--editor-chrome-height', `${editorBar.offsetHeight}px`);
  };
  syncChromeHeight();
  window.addEventListener('resize', syncChromeHeight);

  const toolBtns = root.querySelectorAll<HTMLButtonElement>('[data-tool]');
  const brushRadiusWrap = root.querySelector<HTMLLabelElement>('#brush-radius-wrap')!;
  const brushRadius = root.querySelector<HTMLInputElement>('#brush-radius')!;
  const sculptStrength = root.querySelector<HTMLInputElement>('#sculpt-strength')!;
  const sculptStrengthWrap = root.querySelector<HTMLLabelElement>('#sculpt-strength-wrap')!;
  const mapList = root.querySelector<HTMLSelectElement>('#map-list')!;
  const CURRENT_MAP_VALUE = '__current__';

  let activeTool: EditorToolId = 'sculpt';

  const currentMapSelectValue = (meta: ReturnType<EditorUIHandlers['getMapMeta']>) =>
    meta.persisted ? meta.id : CURRENT_MAP_VALUE;

  const currentMapLabel = (meta: ReturnType<EditorUIHandlers['getMapMeta']>) =>
    meta.persisted ? meta.id : 'Untitled (unsaved)';

  const syncMapListFromMeta = () => {
    const meta = handlers.getMapMeta();
    void fetchMapManifest().then((ids) => {
      const currentValue = currentMapSelectValue(meta);
      const label = currentMapLabel(meta);

      mapList.replaceChildren();

      const currentOpt = document.createElement('option');
      currentOpt.value = currentValue;
      currentOpt.textContent = label;
      currentOpt.selected = true;
      mapList.appendChild(currentOpt);

      for (const id of ids) {
        if (meta.persisted && id === meta.id) continue;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        mapList.appendChild(opt);
      }

      mapList.value = currentValue;
    });
  };

  const saveCurrentMap = async () => {
    const meta = handlers.getMapMeta();
    let id: string;

    if (meta.persisted) {
      id = meta.id;
    } else {
      const defaultId = meta.id === 'new-map' ? '' : meta.id;
      const idRaw = prompt('Map id (filename):', defaultId);
      if (idRaw === null) return;
      id = normalizeMapId(idRaw);
      if (!isValidMapId(id)) {
        showEditorToast(
          'Invalid map id. Use letters, numbers, hyphens, and underscores (max 64 chars).',
          'error',
        );
        return;
      }
    }

    const entities = handlers.serializeEntities();
    const map = gridsToMapFile(id, handlers.getGrids(), {
      entities: entities.length ? entities : undefined,
    });

    try {
      await saveMapToProject(map);
      handlers.onMapSaved?.(map);
      syncMapListFromMeta();
      showEditorToast(
        meta.persisted
          ? `Updated ${id}.`
          : `Saved public/maps/${id}.json and updated manifest.json.`,
        'success',
      );
    } catch (e) {
      downloadMapFile(map);
      const detail = e instanceof Error ? e.message : 'Save failed';
      showEditorToast(
        `Could not save to the project: ${detail}\n\nDownloaded JSON instead — copy to public/maps/ and add the id to manifest.json.`,
        'error',
      );
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    void saveCurrentMap();
  };
  window.addEventListener('keydown', onKeyDown);

  const callMapLoaded = (map: MapFile, grids: MapGrids, persisted?: boolean) => {
    handlers.onMapLoaded(map, grids, persisted);
    syncMapListFromMeta();
  };

  const setActiveTool = (tool: EditorToolId) => {
    activeTool = tool;
    toolBtns.forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
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

  root.querySelector('#btn-new')!.addEventListener('click', () => {
    const map = createNewMapFile('new-map');
    callMapLoaded(map, mapFileToGrids(map), false);
  });

  root.querySelector('#btn-save')!.addEventListener('click', () => {
    void saveCurrentMap();
  });

  mapList.addEventListener('change', async () => {
    const meta = handlers.getMapMeta();
    const id = mapList.value;
    if (id === currentMapSelectValue(meta)) return;
    try {
      const map = await fetchMapById(id);
      callMapLoaded(map, mapFileToGrids(map), true);
    } catch (e) {
      showEditorToast(e instanceof Error ? e.message : 'Failed to fetch map', 'error');
      syncMapListFromMeta();
    }
  });

  syncMapListFromMeta();

  return {
    setActiveTool,
    getActiveTool: () => activeTool,
    dispose: () => {
      window.removeEventListener('resize', syncChromeHeight);
      window.removeEventListener('keydown', onKeyDown);
      disposeEditorToast();
      controlsHint.remove();
      root.remove();
    },
  };
}

export { getMapEntities };
