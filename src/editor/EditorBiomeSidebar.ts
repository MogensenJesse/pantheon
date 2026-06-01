// src/editor/EditorBiomeSidebar.ts — biome brush picker for paint mode
import {
  BIOME_ID_LABELS,
  BiomeId,
  type BiomeIdValue,
} from '../map/MapTypes';
import {
  TERRAIN_TEXTURE_EXTENSIONS,
  terrainTextureUrl,
  type TerrainTextureBiome,
} from '../world/terrain/terrainTextureManifest';


const PAINTABLE_BIOMES: BiomeIdValue[] = [
  BiomeId.Water,
  BiomeId.Shore,
  BiomeId.Forest,
  BiomeId.Hills,
  BiomeId.Mountain,
  BiomeId.Path,
];

const BIOME_TEXTURE_KEY: Partial<Record<BiomeIdValue, TerrainTextureBiome>> = {
  [BiomeId.Shore]: 'shore',
  [BiomeId.Forest]: 'forest',
  [BiomeId.Hills]: 'hills',
  [BiomeId.Mountain]: 'rock',
  [BiomeId.Path]: 'path',
};

export interface EditorBiomeSidebarHandlers {
  onBiomeChange: (biome: BiomeIdValue) => void;
}

export interface EditorBiomeSidebarContext {
  setVisible: (visible: boolean) => void;
  setActiveBiome: (biome: BiomeIdValue) => void;
  dispose: () => void;
}

function thumbUrlsForBiome(biome: BiomeIdValue): string[] {
  const key = BIOME_TEXTURE_KEY[biome];
  if (!key) return [];
  return TERRAIN_TEXTURE_EXTENSIONS.map((ext) => terrainTextureUrl(key, 'color', ext));
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

      const urls = thumbUrlsForBiome(biome);
      let urlIndex = 0;
      const tryNext = () => {
        if (urlIndex >= urls.length || !img.isConnected) {
          img.classList.remove('loading');
          return;
        }
        img.src = urls[urlIndex++];
      };
      img.addEventListener('error', tryNext);
      tryNext();
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
    setActiveBiome,
    dispose: () => root.remove(),
  };
}
