// src/editor/EditorAssetSidebar.ts — categorized asset browser with thumbnails
import type { AssetRegistry } from '../../assets/assetManifest';
import {
  EDITOR_PALETTE,
  type EditorPaletteGroup,
  entriesByGroup,
  markerThumbClass,
  resolveThumbnailAssetKey,
} from '../../map/mapEntityCatalog';
import { PLACE_ID_MIME } from '../place/EditorDragDrop';
import { getAssetThumbnailDataUrl } from './EditorAssetThumbnails';

const GROUP_ORDER: EditorPaletteGroup[] = ['trees', 'rocks', 'plants', 'mountains', 'markers'];

const GROUP_LABELS: Record<EditorPaletteGroup, string> = {
  trees: 'Trees',
  rocks: 'Rocks',
  plants: 'Plants',
  mountains: 'Mountains',
  markers: 'Markers',
};

export interface EditorAssetSidebarContext {
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

function humanizeLabel(label: string): string {
  return label
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initEditorAssetSidebar(assets: AssetRegistry): EditorAssetSidebarContext {
  const root = document.createElement('aside');
  root.id = 'editor-asset-sidebar';
  root.className = 'ui-panel hidden';

  root.innerHTML = `
    <div class="dev-title">Assets</div>
    <p class="dev-hint">Drag assets onto the map. Click placed objects to select and transform.</p>
    <div id="asset-sections"></div>
  `;

  const sectionsHost = root.querySelector('#asset-sections')!;
  const cardByPlaceId = new Map<string, HTMLButtonElement>();

  let activePlaceId = EDITOR_PALETTE[0]?.placeId ?? '';

  const setActiveCard = (placeId: string) => {
    activePlaceId = placeId;
    for (const [id, card] of cardByPlaceId) {
      card.classList.toggle('active', id === placeId);
    }
  };

  for (const group of GROUP_ORDER) {
    const entries = entriesByGroup(group);
    if (!entries.length) continue;

    const details = document.createElement('details');
    details.className = 'dev-section';
    details.open = group === 'trees' || group === 'markers';

    const summary = document.createElement('summary');
    summary.textContent = GROUP_LABELS[group];
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

      card.addEventListener('click', () => setActiveCard(entry.placeId));

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
    dispose: () => root.remove(),
  };
}
