// src/map/authoring/mapDomHelpers.ts — browser DOM helpers for map list UI + JSON download
import { serializeMapFile } from '../MapIO';
import type { MapFile } from '../MapTypes';

export function downloadMapFile(map: MapFile): void {
  const blob = new Blob([serializeMapFile(map)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${map.id || 'map'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function populateMapListSelect(
  select: HTMLSelectElement,
  ids: string[],
  placeholder = '— maps —',
): void {
  select.replaceChildren();
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);
  for (const id of ids) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    select.appendChild(opt);
  }
}
