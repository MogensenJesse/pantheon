// src/editor/ui/EditorAssetBrowser.ts — searchable asset grid + mix selection

import type { AssetRegistry } from '../../assets/assetManifest';
import {
  EDITOR_PALETTE,
  type EditorPaletteGroup,
  entriesByGroup,
  MAP_PROP_KEYS,
  markerThumbClass,
  resolveThumbnailAssetKey,
} from '../../map/authoring/mapEntityCatalog';
import type { EditorPropMixModel } from '../core/EditorPropMixModel';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import { PLACE_ID_MIME } from '../place/EditorDragDrop';
import type { EditorAssetThumbnailService } from './EditorAssetThumbnails';
import { humanizeLabel } from './editorText';

const GROUP_ORDER: EditorPaletteGroup[] = ['trees', 'rocks', 'structures', 'markers'];
const GROUP_LABELS: Record<EditorPaletteGroup, string> = {
  trees: 'Trees',
  rocks: 'Rocks',
  structures: 'Structures',
  markers: 'Markers',
};

function isBrushEligible(placeId: string): boolean {
  return MAP_PROP_KEYS.has(placeId);
}

export interface EditorAssetBrowserContext {
  dispose: () => void;
}

export function createEditorAssetBrowser(
  host: HTMLElement,
  assets: AssetRegistry,
  store: EditorWorkspaceStore,
  mix: EditorPropMixModel,
  thumbnails: EditorAssetThumbnailService,
): EditorAssetBrowserContext {
  const root = document.createElement('div');
  root.className = 'editor-library-panel';
  root.innerHTML = `
    <div class="editor-mix-bar editor-hidden" data-mix-bar>
      <span data-mix-count>Mix: 0</span>
      <button type="button" data-clear-mix>Clear mix</button>
    </div>
    <input type="search" class="editor-search" placeholder="Search assets" aria-label="Search assets" />
    <div data-sections></div>
  `;
  host.appendChild(root);

  const mixBar = root.querySelector<HTMLElement>('[data-mix-bar]')!;
  const mixCount = root.querySelector<HTMLElement>('[data-mix-count]')!;
  const search = root.querySelector<HTMLInputElement>('.editor-search')!;
  const sectionsHost = root.querySelector('[data-sections]')!;
  const cardByPlaceId = new Map<string, HTMLButtonElement>();
  const thumbJobs: Array<{ img: HTMLImageElement; assetKey: string }> = [];
  let thumbsStarted = false;
  let query = '';

  const startThumbnails = () => {
    if (thumbsStarted) return;
    thumbsStarted = true;
    for (const job of thumbJobs) {
      void thumbnails.getDataUrl(assets, job.assetKey).then(
        (url) => {
          if (!url || !job.img.isConnected) return;
          job.img.src = url;
          job.img.classList.remove('is-loading');
        },
        () => undefined,
      );
    }
    thumbJobs.length = 0;
  };

  const setActiveCard = (placeId: string) => {
    for (const [id, card] of cardByPlaceId) {
      const active = id === placeId;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  };

  const syncCardLabels = () => {
    for (const [id, card] of cardByPlaceId) {
      const label = card.dataset.label ?? id;
      const inMix = mix.has(id);
      card.setAttribute('aria-label', inMix ? `${label} (in mix)` : label);
    }
  };

  const applySearch = () => {
    const q = query.trim().toLowerCase();
    for (const [id, card] of cardByPlaceId) {
      const label = (card.dataset.label ?? id).toLowerCase();
      card.classList.toggle(
        'is-hidden',
        q.length > 0 && !label.includes(q) && !id.toLowerCase().includes(q),
      );
    }
  };

  for (const group of GROUP_ORDER) {
    const entries = entriesByGroup(group);
    if (!entries.length) continue;

    const details = document.createElement('details');
    details.className = 'editor-panel-section';
    details.open = group === 'trees' || group === 'markers';

    const summary = document.createElement('summary');
    summary.className = 'editor-section-summary';
    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = GROUP_LABELS[group];
    summary.appendChild(summaryLabel);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'editor-panel-section-body';

    if (group !== 'markers') {
      const toolbar = document.createElement('div');
      toolbar.className = 'editor-section-toolbar';
      const brushAll = document.createElement('button');
      brushAll.type = 'button';
      brushAll.className = 'editor-brush-all';
      brushAll.textContent = 'Mix all';
      brushAll.addEventListener('click', () => {
        mix.addMany(
          entriesByGroup(group)
            .filter((entry) => isBrushEligible(entry.placeId))
            .map((entry) => entry.placeId),
        );
      });
      toolbar.appendChild(brushAll);
      body.appendChild(toolbar);
    }

    const grid = document.createElement('div');
    grid.className = 'editor-card-grid';

    for (const entry of entries) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'editor-card';
      card.dataset.placeId = entry.placeId;
      card.dataset.label = humanizeLabel(entry.label);
      card.title = entry.label;
      card.draggable = true;

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'editor-thumb-wrap';
      const markerClass = markerThumbClass(entry.placeId);
      if (markerClass) {
        const swatch = document.createElement('div');
        swatch.className = `editor-thumb marker-${markerClass}`;
        thumbWrap.appendChild(swatch);
      } else {
        const img = document.createElement('img');
        img.className = 'editor-thumb is-loading';
        img.alt = entry.label;
        thumbWrap.appendChild(img);
        const assetKey = resolveThumbnailAssetKey(entry.placeId);
        if (assetKey) thumbJobs.push({ img, assetKey });
      }

      const label = document.createElement('span');
      label.className = 'editor-card-label';
      label.textContent = humanizeLabel(entry.label);
      card.appendChild(thumbWrap);
      card.appendChild(label);

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData(PLACE_ID_MIME, entry.placeId);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        setActiveCard(entry.placeId);
      });
      card.addEventListener('click', (e) => {
        if (e.shiftKey && isBrushEligible(entry.placeId)) {
          mix.toggle(entry.placeId);
          return;
        }
        setActiveCard(entry.placeId);
      });

      cardByPlaceId.set(entry.placeId, card);
      grid.appendChild(card);
    }

    body.appendChild(grid);
    details.appendChild(body);
    sectionsHost.appendChild(details);
  }

  if (EDITOR_PALETTE[0]) setActiveCard(EDITOR_PALETTE[0].placeId);
  syncCardLabels();

  const unsubMix = mix.subscribe(() => {
    const ids = mix.getIds();
    for (const [id, card] of cardByPlaceId) {
      card.classList.toggle('is-mix', mix.has(id));
    }
    syncCardLabels();
    mixCount.textContent = `Mix: ${ids.length}`;
    const usesMix =
      store.get().tool === 'place' &&
      (store.get().placeSubMode === 'brush' || store.get().placeSubMode === 'fill');
    mixBar.classList.toggle('editor-hidden', !usesMix || ids.length === 0);
  });

  const unsubStore = store.subscribe((state) => {
    const place = state.tool === 'place';
    root.hidden = !place;
    if (place) startThumbnails();
    const usesMix = state.placeSubMode === 'brush' || state.placeSubMode === 'fill';
    mixBar.classList.toggle('editor-hidden', !usesMix || mix.getIds().length === 0);
  });

  search.addEventListener('input', () => {
    query = search.value;
    applySearch();
  });
  root.querySelector('[data-clear-mix]')!.addEventListener('click', () => mix.clear());

  return {
    dispose: () => {
      unsubMix();
      unsubStore();
      root.remove();
    },
  };
}
