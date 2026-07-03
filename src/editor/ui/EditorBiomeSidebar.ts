// src/editor/ui/EditorBiomeSidebar.ts — biome brush picker for paint mode
import { BIOME_ID_LABELS, BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { TerrainTextureBiome } from '../../world/terrain/config/terrainTextureManifest';
import { resolveGltfPackColorUrl } from '../../world/terrain/loaders/loadTerrainGltfPack';

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

export interface EditorBiomeSidebarHandlers {
  onBiomeChange: (biome: BiomeIdValue) => void;
}

export interface EditorBiomeSidebarContext {
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

function loadBiomeThumb(biome: BiomeIdValue, img: HTMLImageElement): void {
  const key = BIOME_TEXTURE_KEY[biome];
  if (!key) {
    img.classList.remove('loading');
    return;
  }
  void resolveGltfPackColorUrl(key).then((url) => {
    if (!img.isConnected) return;
    if (url) {
      img.src = url;
    }
    img.classList.remove('loading');
  });
}

export function initEditorBiomeSidebar(
  handlers: EditorBiomeSidebarHandlers,
  initialBiome: BiomeIdValue = BiomeId.Forest,
): EditorBiomeSidebarContext {
  const root = document.createElement('aside');
  root.id = 'editor-biome-sidebar';
  root.className = 'ui-panel hidden';

  root.innerHTML = `
    <div class="dev-title">Biomes</div>
    <p class="dev-hint">Choose a biome, then paint on the terrain with LMB.</p>
    <div class="biome-grid" id="biome-grid"></div>
  `;

  const grid = root.querySelector('#biome-grid')!;
  const cardByBiome = new Map<BiomeIdValue, HTMLButtonElement>();

  const setActiveBiome = (biome: BiomeIdValue) => {
    for (const [id, card] of cardByBiome) {
      card.classList.toggle('active', id === biome);
    }
  };

  for (const biome of PAINTABLE_BIOMES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'biome-card';
    card.dataset.biome = String(biome);

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'biome-thumb-wrap';

    if (biome === BiomeId.Water) {
      const swatch = document.createElement('div');
      swatch.className = 'biome-thumb biome-water';
      thumbWrap.appendChild(swatch);
    } else {
      const img = document.createElement('img');
      img.className = 'biome-thumb loading';
      img.alt = BIOME_ID_LABELS[biome];
      thumbWrap.appendChild(img);
      loadBiomeThumb(biome, img);
    }

    const label = document.createElement('span');
    label.className = 'biome-label';
    label.textContent = BIOME_ID_LABELS[biome];

    card.appendChild(thumbWrap);
    card.appendChild(label);

    card.addEventListener('click', () => {
      setActiveBiome(biome);
      handlers.onBiomeChange(biome);
    });

    cardByBiome.set(biome, card);
    grid.appendChild(card);
  }

  setActiveBiome(initialBiome);
  document.body.appendChild(root);

  return {
    setVisible: (visible) => root.classList.toggle('hidden', !visible),
    dispose: () => root.remove(),
  };
}
