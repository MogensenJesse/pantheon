// src/ui/kit/icons.ts — one inline-SVG icon set for the HUD, the ability bar, panels and the overview
//
// 24 x 24 outline icons drawn with currentColor, so they take the text colour of whatever holds them.
// Icons are decoration unless given a label: a warning always needs a word next to its icon.

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  warning: 'M12 4l9 16H3L12 4zM12 10v4M12 17.5v.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8v.01',
  energy: 'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
  faith: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  wood: 'M4 9h13a3 3 0 0 1 0 6H4a3 3 0 0 1 0-6zM17 12h.01M4 12h.01',
  food: 'M12 21V8M12 8c-2-1-3-3-3-5 2 1 3 3 3 5zM12 8c2-1 3-3 3-5-2 1-3 3-3 5zM12 14c-2-1-3-3-3-5 2 1 3 3 3 5zM12 14c2-1 3-3 3-5-2 1-3 3-3 5z',
  home: 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-5h4v5',
  villager: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0',
  save: 'M5 4h11l3 3v13H5V4zM8 4v5h7V4M8 20v-6h8v6',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];

export interface IconOptions {
  /** Any CSS length. Default `1.25em`, so the icon scales with the text around it. */
  size?: string;
  /** Spoken name. Without it the icon is hidden from screen readers. */
  label?: string;
}

export function icon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'k-icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const size = options.size ?? '1.25em';
  svg.style.width = size;
  svg.style.height = size;
  if (options.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}
