// src/editor/EditorMapDocument.ts — map save/load/list (toolbar file actions)

import type { MapGrids } from '../map/MapGrids';
import {
  createNewMapFile,
  downloadMapFile,
  fetchMapById,
  fetchMapManifest,
  gridsToMapFile,
  mapFileToGrids,
  saveMapToProject,
} from '../map/MapIO';
import type { MapFile } from '../map/MapTypes';
import { isValidMapId, normalizeMapId } from '../map/MapTypes';
import { showEditorToast } from './editorToast';

export interface EditorMapDocumentHandlers {
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; persisted: boolean };
  onMapLoaded: (map: MapFile, grids: MapGrids, persisted?: boolean) => void;
  onMapSaved?: (map: MapFile) => void;
  serializeEntities: () => import('../map/MapTypes').MapEntity[];
}

export interface EditorMapDocumentContext {
  syncMapListFromMeta: () => void;
  saveCurrentMap: () => Promise<void>;
  loadMapById: (id: string) => Promise<void>;
  createNewMap: () => void;
  bindKeyboardSave: () => () => void;
  setManifestIds: (ids: string[]) => void;
  dispose: () => void;
}

const CURRENT_MAP_VALUE = '__current__';

export function createEditorMapDocument(
  mapList: HTMLSelectElement,
  handlers: EditorMapDocumentHandlers,
): EditorMapDocumentContext {
  let manifestCache: string[] | null = null;

  const currentMapSelectValue = (meta: ReturnType<EditorMapDocumentHandlers['getMapMeta']>) =>
    meta.persisted ? meta.id : CURRENT_MAP_VALUE;

  const currentMapLabel = (meta: ReturnType<EditorMapDocumentHandlers['getMapMeta']>) =>
    meta.persisted ? meta.id : 'Untitled (unsaved)';

  const renderMapList = (ids: string[]) => {
    const meta = handlers.getMapMeta();
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
  };

  const syncMapListFromMeta = () => {
    if (manifestCache) {
      renderMapList(manifestCache);
      return;
    }
    void fetchMapManifest().then((ids) => {
      manifestCache = ids;
      renderMapList(ids);
    });
  };

  const setManifestIds = (ids: string[]) => {
    manifestCache = ids;
    renderMapList(ids);
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
      const result = await saveMapToProject(map);
      handlers.onMapSaved?.(map);
      setManifestIds(result.maps);
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

  const loadMapById = async (id: string) => {
    const map = await fetchMapById(id);
    handlers.onMapLoaded(map, mapFileToGrids(map), true);
    syncMapListFromMeta();
  };

  const createNewMap = () => {
    const map = createNewMapFile('new-map');
    handlers.onMapLoaded(map, mapFileToGrids(map), false);
    syncMapListFromMeta();
  };

  const bindKeyboardSave = () => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      void saveCurrentMap();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  };

  syncMapListFromMeta();

  return {
    syncMapListFromMeta,
    saveCurrentMap,
    loadMapById,
    createNewMap,
    bindKeyboardSave,
    setManifestIds,
    dispose: () => {},
  };
}
