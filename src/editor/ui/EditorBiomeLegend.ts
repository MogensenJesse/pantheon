// src/editor/ui/EditorBiomeLegend.ts — floating legend for painted-biome debug overlay
import {
  BIOME_DEBUG_LEGEND_ORDER,
  BIOME_DEBUG_RGB,
  biomeDebugCssColor,
  biomeDebugLegendLabel,
} from '../../world/terrain/biomeDebugColors';

export interface EditorBiomeLegendContext {
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function initEditorBiomeLegend(
  parent: HTMLElement = document.body,
): EditorBiomeLegendContext {
  const root = document.createElement('aside');
  root.id = 'editor-biome-legend';
  root.className = 'editor-biome-legend is-hidden';
  root.setAttribute('aria-label', 'Biome color legend');

  const title = document.createElement('div');
  title.className = 'editor-biome-legend-title';
  title.textContent = 'Biomes';
  root.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'editor-biome-legend-list';

  for (const id of BIOME_DEBUG_LEGEND_ORDER) {
    const item = document.createElement('li');
    item.className = 'editor-biome-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'editor-biome-legend-swatch';
    swatch.style.background = biomeDebugCssColor(BIOME_DEBUG_RGB[id]);

    const label = document.createElement('span');
    label.className = 'editor-biome-legend-label';
    label.textContent = biomeDebugLegendLabel(id);

    item.appendChild(swatch);
    item.appendChild(label);
    list.appendChild(item);
  }

  root.appendChild(list);
  parent.appendChild(root);

  return {
    setVisible: (visible) => root.classList.toggle('is-hidden', !visible),
    dispose: () => root.remove(),
  };
}
