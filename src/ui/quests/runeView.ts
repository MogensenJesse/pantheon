// src/ui/quests/runeView.ts — the rune as an SVG: the cover of the memory book

import { RUNE_STROKES } from '../../config/visual/rune';
import type { MemoryBook } from '../../quests/memoryBook';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The rune with a stroke for each place: dim until that place is restored, then lit. */
export function runeSvg(rune: MemoryBook['rune']): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-1.25 -1.25 2.5 2.5');
  svg.setAttribute('class', 'qj-rune');
  svg.setAttribute('role', 'img');
  const lit = rune.filter((s) => s.lit).length;
  svg.setAttribute('aria-label', `Your rune: ${lit} of ${rune.length} strokes lit`);
  for (const { kind, lit: isLit } of rune) {
    const [x0, y0, x1, y1] = RUNE_STROKES[kind];
    const line = document.createElementNS(SVG_NS, 'line');
    // The rune's y runs up; the page's runs down.
    line.setAttribute('x1', String(x0));
    line.setAttribute('y1', String(-y0));
    line.setAttribute('x2', String(x1));
    line.setAttribute('y2', String(-y1));
    line.setAttribute('class', isLit ? 'qj-stroke is-lit' : 'qj-stroke');
    svg.appendChild(line);
  }
  return svg;
}
