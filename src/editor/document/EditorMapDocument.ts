// src/editor/document/EditorMapDocument.ts — map save/load/list (document bar file actions)

import { isExrTerrainFile } from '../../map/authoring/classifyTerrainPackFile';
import { decodeExrScanlineFloat } from '../../map/authoring/decodeExrScanline';
import { importExrMap } from '../../map/authoring/importExrMap';
import { importTerrainPack } from '../../map/authoring/importTerrainPack';
import type { MapGrids } from '../../map/MapGrids';
import {
  createNewMapFile,
  deleteMapFromProject,
  fetchMapById,
  fetchMapManifestStrict,
  gridsToMapFile,
  mapFileToGrids,
  saveMapToProject,
} from '../../map/MapIO';
import type {
  MapFile,
  MapGrassSettings,
  MapHeightMode,
  MapTerrainAuxMeta,
  MapWaterSettings,
} from '../../map/MapTypes';
import { isValidMapId, normalizeMapId, suggestDuplicateMapId } from '../../map/MapTypes';
import { shouldBlockEditorShortcut } from '../core/editorFormGuards';
import type { EditorDialogService } from '../ui/editorDialog';
import { editorConfirmDestructive, editorPrompt } from '../ui/editorDialog';
import { type EditorToastService, showEditorToast } from '../ui/editorToast';
import { openTerrainPackImportDialog } from '../ui/TerrainPackImportDialog';

export interface EditorMapDocumentServices {
  toast: EditorToastService;
  dialog: EditorDialogService;
}

export interface EditorMapDocumentHandlers {
  getGrids: () => MapGrids;
  getMapMeta: () => { id: string; persisted: boolean };
  getHeightBase?: () => Float32Array;
  getTerrainShape?: () => import('../../map/MapTypes').MapTerrainShape;
  getBiomePaintRules?: () => import('../../map/MapTypes').BiomePaintRules;
  onMapLoaded: (map: MapFile, grids: MapGrids, persisted?: boolean) => void;
  onMapSaved?: (map: MapFile) => void;
  serializeEntities: () => import('../../map/MapTypes').MapEntity[];
  getGrass?: () => MapGrassSettings | undefined;
  getHeightMode?: () => MapHeightMode | undefined;
  getWater?: () => MapWaterSettings | undefined;
  getTerrainAuxMeta?: () => MapTerrainAuxMeta | undefined;
  isDirty?: () => boolean;
}

export interface EditorMapDocumentContext {
  syncMapListFromMeta: () => void;
  saveCurrentMap: () => Promise<void>;
  loadMapById: (id: string) => Promise<boolean>;
  createNewMap: () => boolean;
  duplicateCurrentMap: () => Promise<boolean>;
  deleteCurrentMap: () => Promise<boolean>;
  importTerrainPackFiles: () => Promise<boolean>;
  bindKeyboardSave: () => () => void;
  dispose: () => void;
}

const CURRENT_MAP_VALUE = '__current__';

function confirmDiscardUnsavedChanges(): boolean {
  return editorConfirmDestructive(
    'Discard unsaved changes to this map?\n\nYour edits will be lost if you continue.',
  );
}

export function createEditorMapDocument(
  mapList: HTMLSelectElement,
  handlers: EditorMapDocumentHandlers,
  services?: EditorMapDocumentServices,
): EditorMapDocumentContext {
  const notify = (message: string, variant: 'success' | 'error' | 'info' = 'info') => {
    if (services?.toast) services.toast.show(message, variant);
    else showEditorToast(message, variant);
  };
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
    void fetchMapManifestStrict(signal)
      .then((ids) => {
        if (disposed || signal.aborted) return;
        manifestCache = ids;
        renderMapList(ids);
      })
      .catch((err) => {
        if (disposed || signal.aborted) return;
        const detail = err instanceof Error ? err.message : 'Could not load map list';
        notify(
          `${detail}. Your current map is unchanged — retry by switching maps or reloading.`,
          'error',
        );
        renderMapList([]);
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
      biomePaintRules: handlers.getBiomePaintRules?.(),
      grass: handlers.getGrass?.(),
      heightMode: handlers.getHeightMode?.(),
      water: handlers.getWater?.(),
      terrainAuxMeta: handlers.getTerrainAuxMeta?.(),
    });
  };

  const promptMapId = (defaultId: string, title: string): string | null => {
    const idRaw = editorPrompt(title, defaultId);
    if (idRaw === null) return null;
    const id = normalizeMapId(idRaw);
    if (!isValidMapId(id)) {
      notify(
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
      notify(successMessage, 'success');
      return true;
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Save failed';
      notify(
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
      try {
        manifestCache = await fetchMapManifestStrict();
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Could not load map list';
        notify(`${detail}. Duplicate needs the project map catalog.`, 'error');
        return false;
      }
    }
    const meta = handlers.getMapMeta();
    const existing = manifestCache ?? [];
    const suggested = suggestDuplicateMapId(meta.id, existing);
    const id = promptMapId(suggested, 'Duplicate as map id:');
    if (id === null) return false;

    if (meta.persisted && id === meta.id) {
      notify('Pick a new id to duplicate. Use Save to update the current map.', 'error');
      return false;
    }

    if (existing.includes(id)) {
      const overwrite = editorConfirmDestructive(
        `Map "${id}" already exists. Overwrite it with a copy of the current map?`,
      );
      if (!overwrite) return false;
    }

    return writeMapToProject(
      buildMapForId(id),
      `Duplicated as public/maps/${id}.json (sidecars copied).`,
    );
  };

  const openBlankMap = (): void => {
    const map = createNewMapFile('new-map');
    handlers.onMapLoaded(map, mapFileToGrids(map), false);
    syncMapListFromMeta();
  };

  const openPersistedMap = async (id: string): Promise<void> => {
    const map = await fetchMapById(id);
    handlers.onMapLoaded(map, mapFileToGrids(map), true);
    syncMapListFromMeta();
  };

  const pickMapAfterDelete = (
    deletedId: string,
    previous: string[],
    remaining: string[],
  ): string | null => {
    if (remaining.length === 0) return null;
    const idx = previous.indexOf(deletedId);
    const later =
      idx >= 0 ? previous.slice(idx + 1).find((id) => remaining.includes(id)) : undefined;
    if (later) return later;
    const earlier =
      idx > 0
        ? [...previous.slice(0, idx)].reverse().find((id) => remaining.includes(id))
        : undefined;
    return earlier ?? remaining[0]!;
  };

  const deleteCurrentMap = async (): Promise<boolean> => {
    const meta = handlers.getMapMeta();
    if (!meta.persisted) {
      notify('Save this map before deleting it from the project.', 'error');
      return false;
    }
    const id = meta.id;
    const confirmed = editorConfirmDestructive(
      `Delete map "${id}" from the project?\n\nThis removes public/maps/${id}.json and its grid files. This cannot be undone.`,
    );
    if (!confirmed) return false;

    const previous = manifestCache ?? [];
    let remaining: string[];
    try {
      remaining = (await deleteMapFromProject(id)).maps;
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Delete failed';
      notify(
        `Could not delete ${id}: ${detail}\n\nMap delete must run via npm run dev (Delete).`,
        'error',
      );
      return false;
    }

    const nextId = pickMapAfterDelete(id, previous, remaining);
    setManifestIds(remaining);
    if (!nextId) {
      openBlankMap();
      notify(`Deleted ${id}.`, 'success');
      return true;
    }
    try {
      await openPersistedMap(nextId);
      notify(`Deleted ${id}. Opened ${nextId}.`, 'success');
    } catch (e) {
      openBlankMap();
      const detail = e instanceof Error ? e.message : 'Load failed';
      notify(`Deleted ${id}, but could not open ${nextId}: ${detail}`, 'error');
    }
    return true;
  };

  const loadMapById = async (id: string): Promise<boolean> => {
    if (shouldBlockForDirty()) return false;
    await openPersistedMap(id);
    return true;
  };

  const createNewMap = (): boolean => {
    if (shouldBlockForDirty()) return false;
    openBlankMap();
    return true;
  };

  const importTerrainPackFiles = async (): Promise<boolean> => {
    if (shouldBlockForDirty()) return false;
    const picked = await openTerrainPackImportDialog(
      document.querySelector<HTMLElement>('.editor-overlays') ?? document.body,
    );
    if (!picked?.files.height) return false;

    try {
      if (isExrTerrainFile(picked.files.height.name)) {
        notify('Importing EXR…', 'info');
        const height = decodeExrScanlineFloat(await picked.files.height.arrayBuffer());
        const imported = importExrMap({ height, flipY: picked.flipY });
        const map = gridsToMapFile('premade', imported.grids, {
          entities: imported.entities,
          terrainShape: imported.terrainShape,
        });
        handlers.onMapLoaded(map, imported.grids, false);
        syncMapListFromMeta();
        notify(
          'Imported EXR into an unsaved map (id: premade). Place orbs/path, then Save.',
          'success',
        );
        return true;
      }

      const height = picked.decoded.height;
      if (!height) throw new Error('Height PNG failed to decode');
      notify('Importing terrain pack…', 'info');
      const imported = importTerrainPack({
        height,
        convex: picked.decoded.convex,
        minM: picked.minM,
        maxM: picked.maxM,
        waterLevelM: picked.waterLevelM,
        flipY: picked.flipY,
      });
      const map = gridsToMapFile('premade', imported.grids, {
        entities: imported.entities,
        terrainShape: imported.terrainShape,
        biomePaintRules: imported.biomePaintRules,
        heightMode: imported.heightMode,
        water: imported.water,
        terrainAuxMeta: imported.auxMeta,
        heightBase: new Float32Array(imported.grids.height),
      });
      handlers.onMapLoaded(map, imported.grids, false);
      syncMapListFromMeta();
      const warn = imported.warnings.length ? `\n${imported.warnings.join('\n')}` : '';
      notify(
        `Imported pack (${imported.stats.srcW}×${imported.stats.srcH}, ${imported.stats.depth}-bit) as unsaved map premade.${warn}`,
        imported.warnings.length ? 'info' : 'success',
      );
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Terrain import failed', 'error');
      return false;
    }
  };

  const bindKeyboardSave = () => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return;
      if (shouldBlockEditorShortcut(e.target)) return;
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
    deleteCurrentMap,
    importTerrainPackFiles,
    bindKeyboardSave,
    dispose: () => {
      disposed = true;
      manifestAbort?.abort();
      manifestAbort = null;
    },
  };
}

export { CURRENT_MAP_VALUE };
