// src/map/authoring/mapDomHelpers.ts — browser DOM helpers for map list UI

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
