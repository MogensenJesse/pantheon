// src/editor/ui/EditorBiomeLegend.ts — floating legend for painted-biome debug overlay
import {
  BIOME_DEBUG_DERIVED_LEGEND,
  BIOME_DEBUG_LEGEND_ORDER,
  BIOME_DEBUG_RGB,
  biomeDebugCssColor,
  biomeDebugLegendLabel,
} from '../../world/terrain/biomeDebugColors';

export interface EditorBiomeLegendContext {
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

function appendLegendItem(
  list: HTMLElement,
  rgb: readonly [number, number, number],
  labelText: string,
): void {
  const item = document.createElement('li');
  item.className = 'editor-biome-legend-item';

  const swatch = document.createElement('span');
  swatch.className = 'editor-biome-legend-swatch';
  swatch.style.background = biomeDebugCssColor(rgb);

  const label = document.createElement('span');
  label.className = 'editor-biome-legend-label';
  label.textContent = labelText;

  item.appendChild(swatch);
  item.appendChild(label);
  list.appendChild(item);
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
    appendLegendItem(list, BIOME_DEBUG_RGB[id], biomeDebugLegendLabel(id));
  }

  root.appendChild(list);

  const derivedTitle = document.createElement('div');
  derivedTitle.className = 'editor-biome-legend-subtitle';
  derivedTitle.textContent = 'Derived';
  root.appendChild(derivedTitle);

  const derivedList = document.createElement('ul');
  derivedList.className = 'editor-biome-legend-list';
  for (const entry of BIOME_DEBUG_DERIVED_LEGEND) {
    appendLegendItem(derivedList, entry.rgb, entry.label);
  }
  root.appendChild(derivedList);
  parent.appendChild(root);

  return {
    setVisible: (visible) => root.classList.toggle('is-hidden', !visible),
    dispose: () => root.remove(),
  };
}
