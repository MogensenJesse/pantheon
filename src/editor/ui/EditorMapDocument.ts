// src/editor/ui/EditorMapDocument.ts — map save/load/list (toolbar file actions)

import { downloadMapFile } from '../../map/authoring/mapDomHelpers';
import type { MapGrids } from '../../map/MapGrids';
import {
  createNewMapFile,
  fetchMapById,
  fetchMapManifest,
  gridsToMapFile,
  mapFileToGrids,
  saveMapToProject,
} from '../../map/MapIO';
import type { MapFile } from '../../map/MapTypes';
import { isValidMapId, normalizeMapId } from '../../map/MapTypes';
import { isFormFieldTarget } from '../core/editorFormGuards';
import { showEditorToast } from './EditorToast';

export interface EditorMapDocumentHandlers {
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; persisted: boolean };
  getHeightBase?: () => Float32Array;
  getTerrainShape?: () => import('../../map/MapTypes').MapTerrainShape;
  onMapLoaded: (map: MapFile, grids: MapGrids, persisted?: boolean) => void;
  onMapSaved?: (map: MapFile) => void;
  serializeEntities: () => import('../../map/MapTypes').MapEntity[];
  isDirty?: () => boolean;
}

export interface EditorMapDocumentContext {
  syncMapListFromMeta: () => void;
  saveCurrentMap: () => Promise<void>;
  loadMapById: (id: string) => Promise<boolean>;
  createNewMap: () => boolean;
  bindKeyboardSave: () => () => void;
  dispose: () => void;
}

const CURRENT_MAP_VALUE = '__current__';

function confirmDiscardUnsavedChanges(): boolean {
  return window.confirm(
    'Discard unsaved changes to this map?\n\nYour edits will be lost if you continue.',
  );
}

export function createEditorMapDocument(
  mapList: HTMLSelectElement,
  handlers: EditorMapDocumentHandlers,
): EditorMapDocumentContext {
  let manifestCache: string[] | null = null;
  let disposed = false;
  let manifestAbort: AbortController | null = null;

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
    if (disposed) return;
    if (manifestCache) {
      renderMapList(manifestCache);
      return;
    }
    manifestAbort?.abort();
    manifestAbort = new AbortController();
    const { signal } = manifestAbort;
    void fetchMapManifest(signal).then((ids) => {
      if (disposed || signal.aborted) return;
      manifestCache = ids;
      renderMapList(ids);
    });
  };

  const setManifestIds = (ids: string[]) => {
    manifestCache = ids;
    renderMapList(ids);
  };

  const shouldBlockForDirty = (): boolean => {
    if (!handlers.isDirty?.()) return false;
    return !confirmDiscardUnsavedChanges();
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
      heightBase: handlers.getHeightBase?.(),
      terrainShape: handlers.getTerrainShape?.(),
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

  const loadMapById = async (id: string): Promise<boolean> => {
    if (shouldBlockForDirty()) return false;
    const map = await fetchMapById(id);
    handlers.onMapLoaded(map, mapFileToGrids(map), true);
    syncMapListFromMeta();
    return true;
  };

  const createNewMap = (): boolean => {
    if (shouldBlockForDirty()) return false;
    const map = createNewMapFile('new-map');
    handlers.onMapLoaded(map, mapFileToGrids(map), false);
    syncMapListFromMeta();
    return true;
  };

  const bindKeyboardSave = () => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return;
      if (isFormFieldTarget(e.target)) return;
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
    dispose: () => {
      disposed = true;
      manifestAbort?.abort();
      manifestAbort = null;
    },
  };
}
