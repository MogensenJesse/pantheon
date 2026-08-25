// src/editor/ui/EditorDocumentBar.ts — map file actions, undo/redo, view toggles

import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import type { EditorMapDocumentContext } from '../document/EditorMapDocument';
import { CURRENT_MAP_VALUE } from '../document/EditorMapDocument';
import { showEditorToast } from './editorToast';

export interface EditorDocumentBarHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onFogPreviewChange: (enabled: boolean) => void;
  onBiomeVisChange: (enabled: boolean) => void;
  onPerfOverlayChange: (enabled: boolean) => void;
  onPerfInspectorChange: (enabled: boolean) => void;
}

export interface EditorDocumentBarContext {
  mapList: HTMLSelectElement;
  dispose: () => void;
}

export function createEditorDocumentBar(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  documentApi: () => EditorMapDocumentContext,
  handlers: EditorDocumentBarHandlers,
): EditorDocumentBarContext {
  host.innerHTML = `
    <div class="editor-document-bar-left">
      <span class="editor-title">Map Editor</span>
      <select id="map-list" aria-label="Open map"></select>
      <button type="button" id="btn-new">New</button>
      <button type="button" id="btn-import-exr" title="Import Height Map.exr + optional Diffuse Map.exr">Import EXR</button>
      <button type="button" id="btn-duplicate" title="Save a copy under a new map id">Duplicate</button>
    </div>
    <div class="editor-document-bar-right">
      <button type="button" id="btn-undo" title="Undo (Ctrl+Z)">Undo</button>
      <button type="button" id="btn-redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
      <details class="editor-view-menu">
        <summary>View</summary>
        <div class="editor-view-menu-body">
          <label class="editor-check"><input type="checkbox" id="editor-fog-enabled" /> Fog</label>
          <label class="editor-check" title="Bright false-color painted biomes">
            <input type="checkbox" id="editor-biome-vis" /> Biomes
          </label>
          <label class="editor-check" title="stats.js + stats-gl overlay">
            <input type="checkbox" id="editor-perf-overlay" /> Perf
          </label>
          <label class="editor-check" title="Three.js Inspector (do not Force WebGL)">
            <input type="checkbox" id="editor-perf-inspector" /> Inspector
          </label>
        </div>
      </details>
      <span class="editor-dirty-dot is-clean" id="editor-dirty-dot" title="Unsaved changes"></span>
      <button type="button" id="btn-save" title="Save (Ctrl+S)">Save</button>
    </div>
  `;

  const mapList = host.querySelector<HTMLSelectElement>('#map-list')!;
  const undoBtn = host.querySelector<HTMLButtonElement>('#btn-undo')!;
  const redoBtn = host.querySelector<HTMLButtonElement>('#btn-redo')!;
  const dirtyDot = host.querySelector<HTMLElement>('#editor-dirty-dot')!;
  const fog = host.querySelector<HTMLInputElement>('#editor-fog-enabled')!;
  const biomeVis = host.querySelector<HTMLInputElement>('#editor-biome-vis')!;
  const perf = host.querySelector<HTMLInputElement>('#editor-perf-overlay')!;
  const inspector = host.querySelector<HTMLInputElement>('#editor-perf-inspector')!;

  const unsub = store.subscribe((state) => {
    undoBtn.disabled = !state.canUndo;
    redoBtn.disabled = !state.canRedo;
    dirtyDot.classList.toggle('is-clean', !state.dirty);
    fog.checked = state.fogPreview;
    biomeVis.checked = state.biomeVis;
    perf.checked = state.perfOverlay;
    inspector.checked = state.perfInspector;
  });

  host.querySelector('#btn-new')!.addEventListener('click', () => {
    documentApi().createNewMap();
  });
  host.querySelector('#btn-import-exr')!.addEventListener('click', () => {
    void documentApi().importExrMapFiles();
  });
  host.querySelector('#btn-duplicate')!.addEventListener('click', () => {
    void documentApi().duplicateCurrentMap();
  });
  host.querySelector('#btn-save')!.addEventListener('click', () => {
    void documentApi().saveCurrentMap();
  });
  undoBtn.addEventListener('click', handlers.onUndo);
  redoBtn.addEventListener('click', handlers.onRedo);

  fog.addEventListener('change', () => {
    store.patch({ fogPreview: fog.checked });
    handlers.onFogPreviewChange(fog.checked);
  });
  biomeVis.addEventListener('change', () => {
    store.patch({ biomeVis: biomeVis.checked });
    handlers.onBiomeVisChange(biomeVis.checked);
  });
  perf.addEventListener('change', () => {
    store.patch({ perfOverlay: perf.checked });
    handlers.onPerfOverlayChange(perf.checked);
  });
  inspector.addEventListener('change', () => {
    store.patch({ perfInspector: inspector.checked });
    handlers.onPerfInspectorChange(inspector.checked);
  });

  mapList.addEventListener('change', async () => {
    const meta = { persisted: store.get().mapPersisted, id: store.get().mapId };
    const id = mapList.value;
    const currentValue = meta.persisted ? meta.id : CURRENT_MAP_VALUE;
    if (id === currentValue) return;
    try {
      const loaded = await documentApi().loadMapById(id);
      if (!loaded) documentApi().syncMapListFromMeta();
    } catch (e) {
      showEditorToast(e instanceof Error ? e.message : 'Failed to fetch map', 'error');
      documentApi().syncMapListFromMeta();
    }
  });

  return {
    mapList,
    dispose: () => unsub(),
  };
}
