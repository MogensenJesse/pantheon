// src/editor/document/EditorMapDocument.ts — map save/load/list (document bar file actions)

import { decodeExrScanlineFloat } from '../../map/authoring/decodeExrScanline';
import { importExrMap } from '../../map/authoring/importExrMap';
import type { MapGrids } from '../../map/MapGrids';
import {
  createNewMapFile,
  fetchMapById,
  fetchMapManifest,
  gridsToMapFile,
  mapFileToGrids,
  saveMapToProject,
} from '../../map/MapIO';
import type { MapFile, MapGrassSettings } from '../../map/MapTypes';
import { isValidMapId, normalizeMapId, suggestDuplicateMapId } from '../../map/MapTypes';
import { isFormFieldTarget } from '../core/editorFormGuards';
import { showEditorToast } from '../ui/editorToast';

export interface EditorMapDocumentHandlers {
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; persisted: boolean };
  getHeightBase?: () => Float32Array;
  getTerrainShape?: () => import('../../map/MapTypes').MapTerrainShape;
  onMapLoaded: (map: MapFile, grids: MapGrids, persisted?: boolean) => void;
  onMapSaved?: (map: MapFile) => void;
  serializeEntities: () => import('../../map/MapTypes').MapEntity[];
  getGrass?: () => MapGrassSettings | undefined;
  isDirty?: () => boolean;
}

export interface EditorMapDocumentContext {
  syncMapListFromMeta: () => void;
  saveCurrentMap: () => Promise<void>;
  loadMapById: (id: string) => Promise<boolean>;
  createNewMap: () => boolean;
  duplicateCurrentMap: () => Promise<boolean>;
  importExrMapFiles: () => Promise<boolean>;
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

  const buildMapForId = (id: string): MapFile => {
    const entities = handlers.serializeEntities();
    return gridsToMapFile(id, handlers.getGrids(), {
      entities: entities.length ? entities : undefined,
      heightBase: handlers.getHeightBase?.(),
      terrainShape: handlers.getTerrainShape?.(),
      grass: handlers.getGrass?.(),
    });
  };

  const promptMapId = (defaultId: string, title: string): string | null => {
    const idRaw = prompt(title, defaultId);
    if (idRaw === null) return null;
    const id = normalizeMapId(idRaw);
    if (!isValidMapId(id)) {
      showEditorToast(
        'Invalid map id. Use letters, numbers, hyphens, and underscores (max 64 chars).',
        'error',
      );
      return null;
    }
    return id;
  };

  const writeMapToProject = async (map: MapFile, successMessage: string): Promise<boolean> => {
    try {
      const result = await saveMapToProject(map);
      handlers.onMapSaved?.(map);
      setManifestIds(result.maps);
      showEditorToast(successMessage, 'success');
      return true;
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Save failed';
      showEditorToast(
        `Could not save to the project: ${detail}\n\nGrid sidecars must be written via npm run dev (Save).`,
        'error',
      );
      return false;
    }
  };

  const saveCurrentMap = async () => {
    const meta = handlers.getMapMeta();
    let id: string;

    if (meta.persisted) {
      id = meta.id;
    } else {
      const defaultId = meta.id === 'new-map' ? '' : meta.id;
      const prompted = promptMapId(defaultId, 'Map id (filename):');
      if (prompted === null) return;
      id = prompted;
    }

    await writeMapToProject(
      buildMapForId(id),
      meta.persisted ? `Updated ${id}.` : `Saved public/maps/${id}.json and updated manifest.json.`,
    );
  };

  const duplicateCurrentMap = async (): Promise<boolean> => {
    if (!manifestCache) {
      manifestCache = await fetchMapManifest();
    }
    const meta = handlers.getMapMeta();
    const existing = manifestCache ?? [];
    const suggested = suggestDuplicateMapId(meta.id, existing);
    const id = promptMapId(suggested, 'Duplicate as map id:');
    if (id === null) return false;

    if (meta.persisted && id === meta.id) {
      showEditorToast('Pick a new id to duplicate. Use Save to update the current map.', 'error');
      return false;
    }

    if (existing.includes(id)) {
      const overwrite = window.confirm(
        `Map "${id}" already exists. Overwrite it with a copy of the current map?`,
      );
      if (!overwrite) return false;
    }

    return writeMapToProject(
      buildMapForId(id),
      `Duplicated as public/maps/${id}.json (sidecars copied).`,
    );
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

  const pickExrFile = (title: string): Promise<File | null> =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.exr,image/x-exr';
      input.title = title;
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });

  const importExrMapFiles = async (): Promise<boolean> => {
    if (shouldBlockForDirty()) return false;
    const heightFile = await pickExrFile('Height Map.exr');
    if (!heightFile) return false;

    const includeDiffuse = window.confirm(
      'Import a matching Diffuse Map.exr to paint biomes from color?\n\nOK = pick diffuse, Cancel = height only (Shore).',
    );
    let diffuseFile: File | null = null;
    if (includeDiffuse) {
      diffuseFile = await pickExrFile('Diffuse Map.exr');
    }

    try {
      showEditorToast('Importing EXR…', 'info');
      const height = decodeExrScanlineFloat(await heightFile.arrayBuffer());
      const diffuse = diffuseFile
        ? decodeExrScanlineFloat(await diffuseFile.arrayBuffer())
        : undefined;
      const imported = importExrMap({ height, diffuse });
      const map = gridsToMapFile('premade', imported.grids, {
        entities: imported.entities,
        terrainShape: imported.terrainShape,
      });
      handlers.onMapLoaded(map, imported.grids, false);
      syncMapListFromMeta();
      showEditorToast(
        'Imported EXR into an unsaved map (id: premade). Place orbs/path, then Save.',
        'success',
      );
      return true;
    } catch (e) {
      showEditorToast(e instanceof Error ? e.message : 'EXR import failed', 'error');
      return false;
    }
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
    duplicateCurrentMap,
    importExrMapFiles,
    bindKeyboardSave,
    dispose: () => {
      disposed = true;
      manifestAbort?.abort();
      manifestAbort = null;
    },
  };
}

export { CURRENT_MAP_VALUE };
