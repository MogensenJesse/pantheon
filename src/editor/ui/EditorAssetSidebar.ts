// src/editor/ui/EditorAssetSidebar.ts — categorized asset browser with thumbnails
import type { AssetRegistry } from '../../assets/assetManifest';
import {
  EDITOR_PALETTE,
  type EditorPaletteGroup,
  entriesByGroup,
  MAP_PROP_KEYS,
  markerThumbClass,
  resolveThumbnailAssetKey,
} from '../../map/mapEntityCatalog';
import { PLACE_ID_MIME } from '../place/EditorDragDrop';
import { setPlaceOptions } from '../place/placeOptions';
import type { PlaceSubMode } from './EditorUI';
import { getAssetThumbnailDataUrl } from './EditorAssetThumbnails';

const GROUP_ORDER: EditorPaletteGroup[] = [
  'trees',
  'dead_trees',
  'rocks',
  'rock_paths',
  'plants',
  'flowers',
  'mushrooms',
  'pebbles',
  'markers',
];

const GROUP_LABELS: Record<EditorPaletteGroup, string> = {
  trees: 'Trees',
  dead_trees: 'Dead trees',
  rocks: 'Rocks',
  rock_paths: 'Rock paths',
  plants: 'Plants',
  flowers: 'Flowers',
  mushrooms: 'Mushrooms',
  pebbles: 'Pebbles',
  markers: 'Markers',
};

const HINT_SINGLE =
  'Drag assets onto the map. Click placed objects to select and transform.';
const HINT_BRUSH =
  'Shift+click props to add them to the brush mix. Use Brush all on a group for forests.';

export interface EditorAssetSidebarHandlers {
  onBrushDensity?: (density: number) => void;
  onBrushSpacing?: (spacingM: number) => void;
}

export interface EditorAssetSidebarContext {
  setVisible: (visible: boolean) => void;
  setPlaceSubMode: (mode: PlaceSubMode) => void;
  getBrushPlaceIds: () => readonly string[];
  onBrushSetChange: (cb: (ids: readonly string[]) => void) => () => void;
  dispose: () => void;
}

function humanizeLabel(label: string): string {
  return label
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isBrushEligible(placeId: string): boolean {
  return MAP_PROP_KEYS.has(placeId);
}

export function initEditorAssetSidebar(
  assets: AssetRegistry,
  handlers: EditorAssetSidebarHandlers = {},
): EditorAssetSidebarContext {
  const root = document.createElement('aside');
  root.id = 'editor-asset-sidebar';
  root.className = 'ui-panel hidden';

  root.innerHTML = `
    <div class="dev-title">Assets</div>
    <p class="dev-hint" id="asset-sidebar-hint">${HINT_SINGLE}</p>
    <div id="asset-mix-bar" class="asset-mix-bar hidden">
      <span id="asset-mix-count">Mix: 0</span>
      <button type="button" id="asset-clear-mix" class="asset-clear-mix">Clear mix</button>
    </div>
    <details class="dev-section" id="place-options-section" open>
      <summary>Placement options</summary>
      <div class="dev-section-body editor-place-sidebar-options">
        <label class="editor-check">
          <input type="checkbox" id="place-random-rot" />
          <span>Random rotation</span>
        </label>
        <label class="editor-check">
          <input type="checkbox" id="place-random-scale" />
          <span>Random scale</span>
        </label>
        <label id="place-scale-min-wrap" class="editor-sidebar-range hidden">Scale min
          <input type="range" id="place-scale-min" min="50" max="200" value="80" />
        </label>
        <label id="place-scale-max-wrap" class="editor-sidebar-range hidden">Scale max
          <input type="range" id="place-scale-max" min="50" max="200" value="120" />
        </label>
        <label id="brush-density-wrap" class="editor-sidebar-range place-brush-only hidden">Density
          <input type="range" id="brush-density" min="1" max="30" value="6" />
        </label>
        <label id="brush-spacing-wrap" class="editor-sidebar-range place-brush-only hidden">Spacing (m)
          <input type="range" id="brush-spacing" min="0" max="40" value="12" />
        </label>
      </div>
    </details>
    <div id="asset-sections"></div>
  `;

  const hintEl = root.querySelector<HTMLParagraphElement>('#asset-sidebar-hint')!;
  const mixBar = root.querySelector<HTMLDivElement>('#asset-mix-bar')!;
  const mixCountEl = root.querySelector<HTMLSpanElement>('#asset-mix-count')!;
  const clearMixBtn = root.querySelector<HTMLButtonElement>('#asset-clear-mix')!;
  const placeRandomRot = root.querySelector<HTMLInputElement>('#place-random-rot')!;
  const placeRandomScale = root.querySelector<HTMLInputElement>('#place-random-scale')!;
  const placeScaleMinWrap = root.querySelector<HTMLLabelElement>('#place-scale-min-wrap')!;
  const placeScaleMaxWrap = root.querySelector<HTMLLabelElement>('#place-scale-max-wrap')!;
  const placeScaleMin = root.querySelector<HTMLInputElement>('#place-scale-min')!;
  const placeScaleMax = root.querySelector<HTMLInputElement>('#place-scale-max')!;
  const brushDensity = root.querySelector<HTMLInputElement>('#brush-density')!;
  const brushSpacing = root.querySelector<HTMLInputElement>('#brush-spacing')!;
  const brushOnlyOptionEls = root.querySelectorAll<HTMLElement>('.place-brush-only');
  const sectionsHost = root.querySelector('#asset-sections')!;
  const cardByPlaceId = new Map<string, HTMLButtonElement>();

  const brushSet = new Set<string>();
  const brushSetListeners = new Set<(ids: readonly string[]) => void>();
  let placeSubMode: PlaceSubMode = 'single';
  let activePlaceId = EDITOR_PALETTE[0]?.placeId ?? '';

  const notifyBrushSetChange = () => {
    const ids = [...brushSet];
    for (const cb of brushSetListeners) cb(ids);
  };

  const syncBrushMixUi = () => {
    for (const [id, card] of cardByPlaceId) {
      card.classList.toggle('brush-mix', brushSet.has(id));
    }
    const count = brushSet.size;
    mixCountEl.textContent = `Mix: ${count}`;
    mixBar.classList.toggle('hidden', placeSubMode !== 'brush' || count === 0);
  };

  const syncSubModeUi = () => {
    hintEl.textContent = placeSubMode === 'brush' ? HINT_BRUSH : HINT_SINGLE;
    for (const el of brushOnlyOptionEls) {
      el.classList.toggle('hidden', placeSubMode !== 'brush');
    }
    syncBrushMixUi();
  };

  const syncPlaceScaleChrome = () => {
    const showScale = placeRandomScale.checked;
    placeScaleMinWrap.classList.toggle('hidden', !showScale);
    placeScaleMaxWrap.classList.toggle('hidden', !showScale);
  };

  const syncPlaceOptions = () => {
    setPlaceOptions({
      randomRotation: placeRandomRot.checked,
      randomScale: placeRandomScale.checked,
      scaleMinMul: Number(placeScaleMin.value) / 100,
      scaleMaxMul: Number(placeScaleMax.value) / 100,
    });
  };

  placeRandomRot.addEventListener('change', syncPlaceOptions);
  placeRandomScale.addEventListener('change', () => {
    syncPlaceScaleChrome();
    syncPlaceOptions();
  });
  placeScaleMin.addEventListener('input', syncPlaceOptions);
  placeScaleMax.addEventListener('input', syncPlaceOptions);
  brushDensity.addEventListener('input', () => {
    handlers.onBrushDensity?.(Number(brushDensity.value));
  });
  brushSpacing.addEventListener('input', () => {
    handlers.onBrushSpacing?.(Number(brushSpacing.value) / 10);
  });
  syncPlaceScaleChrome();
  syncPlaceOptions();

  const setActiveCard = (placeId: string) => {
    activePlaceId = placeId;
    for (const [id, card] of cardByPlaceId) {
      card.classList.toggle('active', id === placeId);
    }
  };

  const toggleBrushMix = (placeId: string) => {
    if (!isBrushEligible(placeId)) return;
    if (brushSet.has(placeId)) brushSet.delete(placeId);
    else brushSet.add(placeId);
    syncBrushMixUi();
    notifyBrushSetChange();
  };

  const addGroupToBrushMix = (group: EditorPaletteGroup) => {
    if (group === 'markers') return;
    for (const entry of entriesByGroup(group)) {
      if (isBrushEligible(entry.placeId)) brushSet.add(entry.placeId);
    }
    syncBrushMixUi();
    notifyBrushSetChange();
  };

  clearMixBtn.addEventListener('click', () => {
    brushSet.clear();
    syncBrushMixUi();
    notifyBrushSetChange();
  });

  for (const group of GROUP_ORDER) {
    const entries = entriesByGroup(group);
    if (!entries.length) continue;

    const details = document.createElement('details');
    details.className = 'dev-section';
    details.open = group === 'trees' || group === 'markers';

    const summary = document.createElement('summary');
    summary.className = 'asset-section-summary';
    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = GROUP_LABELS[group];
    summary.appendChild(summaryLabel);

    if (group !== 'markers') {
      const brushAllBtn = document.createElement('button');
      brushAllBtn.type = 'button';
      brushAllBtn.className = 'asset-brush-all';
      brushAllBtn.textContent = 'Brush all';
      brushAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addGroupToBrushMix(group);
      });
      summary.appendChild(brushAllBtn);
    }

    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'dev-section-body';

    const grid = document.createElement('div');
    grid.className = 'asset-grid';

    for (const entry of entries) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'asset-card';
      card.dataset.placeId = entry.placeId;
      card.title = entry.label;

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'asset-thumb-wrap';

      const markerClass = markerThumbClass(entry.placeId);
      if (markerClass) {
        const swatch = document.createElement('div');
        swatch.className = `asset-thumb marker-${markerClass}`;
        thumbWrap.appendChild(swatch);
      } else {
        const img = document.createElement('img');
        img.className = 'asset-thumb loading';
        img.alt = entry.label;
        thumbWrap.appendChild(img);
        const assetKey = resolveThumbnailAssetKey(entry.placeId);
        if (assetKey) {
          void getAssetThumbnailDataUrl(assets, assetKey).then((url) => {
            if (!url || !img.isConnected) return;
            img.src = url;
            img.classList.remove('loading');
          });
        }
      }

      const label = document.createElement('span');
      label.className = 'asset-label';
      label.textContent = humanizeLabel(entry.label);

      card.appendChild(thumbWrap);
      card.appendChild(label);

      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData(PLACE_ID_MIME, entry.placeId);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
        setActiveCard(entry.placeId);
      });

      card.addEventListener('click', (e) => {
        if (e.shiftKey && isBrushEligible(entry.placeId)) {
          toggleBrushMix(entry.placeId);
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

  if (activePlaceId) setActiveCard(activePlaceId);

  document.body.appendChild(root);

  return {
    setVisible: (visible) => root.classList.toggle('hidden', !visible),
    setPlaceSubMode: (mode) => {
      placeSubMode = mode;
      syncSubModeUi();
    },
    getBrushPlaceIds: () => [...brushSet],
    onBrushSetChange: (cb) => {
      brushSetListeners.add(cb);
      cb([...brushSet]);
      return () => brushSetListeners.delete(cb);
    },
    dispose: () => root.remove(),
  };
}
