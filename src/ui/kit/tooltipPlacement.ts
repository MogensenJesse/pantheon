// src/ui/kit/tooltipPlacement.ts — where a tooltip goes relative to its anchor (pure: no DOM, node-runnable)

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  side: 'top' | 'bottom';
}

/**
 * Above the anchor when there is room, below it otherwise, centred on it and kept `margin` px inside
 * the viewport. When neither side fits, it is pinned to the viewport instead of leaving the screen.
 */
export function placeTooltip(
  anchor: Rect,
  tip: Size,
  viewport: Size,
  gap = 8,
  margin = 8,
): Placement {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const x = clamp(
    anchor.left + anchor.width / 2 - tip.width / 2,
    margin,
    Math.max(margin, viewport.width - tip.width - margin),
  );
  const above = anchor.top - gap - tip.height;
  if (above >= margin) return { x, y: above, side: 'top' };
  const below = anchor.top + anchor.height + gap;
  const maxY = Math.max(margin, viewport.height - tip.height - margin);
  return { x, y: clamp(below, margin, maxY), side: 'bottom' };
}
