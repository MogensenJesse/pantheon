// src/editor/ui/editorToolIcons.ts — inline SVG icons for the editor tool rail

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgIcon(paths: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = paths;
  return svg;
}

/** Raised terrain / sculpt */
export function createSculptToolIcon(): SVGSVGElement {
  return svgIcon(`
    <path fill="currentColor" d="M4 18h16v2H4v-2zm2.4-3.2 3.2-5.4 3.4 2.8 4.6-6.2L20 9.8l-6.2 8.2-3.6-3-3 5H6.4z"/>
  `);
}

/** Paint brush */
export function createPaintToolIcon(): SVGSVGElement {
  return svgIcon(`
    <path fill="currentColor" d="m20.7 4.6-1.3-1.3a2 2 0 0 0-2.8 0l-1.1 1.1 4.1 4.1 1.1-1.1a2 2 0 0 0 0-2.8zM3 17.2V21h3.8l9.9-9.9-3.8-3.8L3 17.2z"/>
  `);
}

/** Place / prop pin */
export function createPlaceToolIcon(): SVGSVGElement {
  return svgIcon(`
    <path fill="currentColor" d="M12 2a6 6 0 0 0-6 6c0 4.5 6 12 6 12s6-7.5 6-12a6 6 0 0 0-6-6zm0 8.5A2.5 2.5 0 1 1 12 5a2.5 2.5 0 0 1 0 5.5z"/>
  `);
}

/** Info / help */
export function createInfoToolIcon(): SVGSVGElement {
  return svgIcon(`
    <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
  `);
}
