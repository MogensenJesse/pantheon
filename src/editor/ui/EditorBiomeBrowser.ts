// src/editor/ui/EditorBiomeBrowser.ts — biome thumbnail picker for Paint brush

import { BIOME_ID_LABELS, BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { TerrainTextureBiome } from '../../world/terrain/config/terrainTextureManifest';
import { resolveGltfPackColorUrl } from '../../world/terrain/loaders/loadTerrainGltfPack';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';

const PAINTABLE_BIOMES: BiomeIdValue[] = [
  BiomeId.Water,
  BiomeId.Shore,
  BiomeId.Forest,
  BiomeId.Hills,
  BiomeId.Mountain,
  BiomeId.Meadow,
  BiomeId.Path,
];

const BIOME_TEXTURE_KEY: Partial<Record<BiomeIdValue, TerrainTextureBiome>> = {
  [BiomeId.Shore]: 'shore',
  [BiomeId.Forest]: 'forest',
  [BiomeId.Hills]: 'hills',
  [BiomeId.Mountain]: 'mountain',
  [BiomeId.Meadow]: 'meadow',
  [BiomeId.Path]: 'path',
};

export interface EditorBiomeBrowserHandlers {
  onBiomeChange: (biome: BiomeIdValue) => void;
}

export interface EditorBiomeBrowserContext {
  dispose: () => void;
}

function loadBiomeThumb(biome: BiomeIdValue, img: HTMLImageElement): void {
  const key = BIOME_TEXTURE_KEY[biome];
  if (!key) {
    img.classList.remove('is-loading');
    return;
  }
  void resolveGltfPackColorUrl(key).then((url) => {
    if (!img.isConnected) return;
    if (url) img.src = url;
    img.classList.remove('is-loading');
  });
}

export function createEditorBiomeBrowser(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: EditorBiomeBrowserHandlers,
  initialBiome: BiomeIdValue = BiomeId.Forest,
): EditorBiomeBrowserContext {
  const root = document.createElement('div');
  root.className = 'editor-library-panel';
  root.innerHTML = `
    <div class="editor-card-grid" data-grid role="radiogroup" aria-label="Paint biomes"></div>
  `;
  host.appendChild(root);
  const grid = root.querySelector('[data-grid]')!;
  const cardByBiome = new Map<BiomeIdValue, HTMLButtonElement>();

  const setActive = (biome: BiomeIdValue) => {
    for (const [id, card] of cardByBiome) {
      const active = id === biome;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  };

  for (const biome of PAINTABLE_BIOMES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'editor-card';
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', 'false');
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'editor-thumb-wrap';
    if (biome === BiomeId.Water) {
      const swatch = document.createElement('div');
      swatch.className = 'editor-thumb biome-water';
      thumbWrap.appendChild(swatch);
    } else {
      const img = document.createElement('img');
      img.className = 'editor-thumb is-loading';
      img.alt = BIOME_ID_LABELS[biome];
      thumbWrap.appendChild(img);
      loadBiomeThumb(biome, img);
    }
    const label = document.createElement('span');
    label.className = 'editor-card-label';
    label.textContent = BIOME_ID_LABELS[biome];
    card.appendChild(thumbWrap);
    card.appendChild(label);
    card.addEventListener('click', () => {
      setActive(biome);
      handlers.onBiomeChange(biome);
    });
    cardByBiome.set(biome, card);
    grid.appendChild(card);
  }
  setActive(initialBiome);

  const unsub = store.subscribe((state) => {
    root.hidden = !(state.tool === 'paint' && state.paintSubMode === 'brush');
  });

  return {
    dispose: () => {
      unsub();
      root.remove();
    },
  };
}
