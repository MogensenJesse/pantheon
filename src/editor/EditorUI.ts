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
  populateMapListSelect,
  saveMapToProject,
} from '../map/MapIO';
import { WORLD } from '../world/WorldConfig';
import type { MapGrids } from '../map/MapGrids';

export type EditorToolId = 'sculpt' | 'paint' | 'place';

export interface EditorUIHandlers {
  onToolChange: (tool: EditorToolId) => void;
  onBrushRadius: (radius: number) => void;
  onSculptStrength: (strength: number) => void;
  onMapLoaded: (map: MapFile, grids: MapGrids) => void;
  onMapSaved?: (map: MapFile) => void;
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; name: string };
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
    'Pick a biome in the sidebar · LMB paints terrain · Brush in toolbar · Camera: Space+LMB orbit · RMB pan · wheel zoom',
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
        <select id="map-list"><option value="">— maps —</option></select>
        <button type="button" id="btn-save">Save</button>
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

  let activeTool: EditorToolId = 'sculpt';

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
    const seed = prompt('Procedural seed (empty = default):', '') ?? '';
    const map = createNewMapFile('new-map', 'New Map', seed.trim() || WORLD.SEED);
    handlers.onMapLoaded(map, mapFileToGrids(map));
  });

  root.querySelector('#btn-save')!.addEventListener('click', async () => {
    const meta = handlers.getMapMeta();
    const idRaw = prompt('Map id (filename):', meta.id);
    if (idRaw === null) return;
    const id = normalizeMapId(idRaw);
    if (!isValidMapId(id)) {
      alert('Invalid map id. Use letters, numbers, hyphens, and underscores (max 64 chars).');
      return;
    }
    const nameRaw = prompt('Map name:', meta.name);
    if (nameRaw === null) return;
    const name = nameRaw.trim() || id;
    const entities = handlers.serializeEntities();
    const map = gridsToMapFile(id, name, handlers.getGrids(), {
      entities: entities.length ? entities : undefined,
    });

    try {
      const result = await saveMapToProject(map);
      handlers.onMapSaved?.(map);
      populateMapListSelect(mapList, result.maps);
      alert(`Saved to ${result.path} and updated manifest.json.`);
    } catch {
      downloadMapFile(map);
      alert(
        'Could not save to the project (is npm run dev running?). Downloaded JSON instead — copy it to public/maps/ and add the id to manifest.json.',
      );
    }
  });

  mapList.addEventListener('change', async () => {
    const id = mapList.value;
    if (!id) return;
    try {
      const map = await fetchMapById(id);
      handlers.onMapLoaded(map, mapFileToGrids(map));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to fetch map');
    }
    mapList.value = '';
  });

  void fetchMapManifest().then((ids) => populateMapListSelect(mapList, ids));

  return {
    setActiveTool,
    getActiveTool: () => activeTool,
    dispose: () => {
      window.removeEventListener('resize', syncChromeHeight);
      controlsHint.remove();
      root.remove();
    },
  };
}

export { getMapEntities };
