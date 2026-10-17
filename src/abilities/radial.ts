// src/abilities/radial.ts — the radial cast menu's geometry (pure: no DOM, node-runnable)
//
// The mouse stays locked while the menu is open; its movement moves a virtual pointer around the
// centre. The sector under the pointer is the choice, and releasing the key casts it. Sector 0 is at
// the top and they run clockwise.

export interface Point {
  x: number;
  y: number;
}

/** Moves the pointer by a mouse delta and keeps it inside the circle of `maxRadius` pixels. */
export function stepPointer(pointer: Point, dx: number, dy: number, maxRadius: number): Point {
  const x = pointer.x + dx;
  const y = pointer.y + dy;
  const len = Math.hypot(x, y);
  if (len <= maxRadius || len === 0) return { x, y };
  const k = maxRadius / len;
  return { x: x * k, y: y * k };
}

/** The sector the pointer is in, or null in the middle (nothing chosen) or when there are no sectors. */
export function sectorAt(
  pointer: Point,
  count: number,
  maxRadius: number,
  deadZone = 0.3,
): number | null {
  if (count <= 0) return null;
  if (Math.hypot(pointer.x, pointer.y) < maxRadius * deadZone) return null;
  const size = (Math.PI * 2) / count;
  // Screen y grows downwards, so "up" is -y; the angle runs clockwise from the top.
  const angle = (Math.atan2(pointer.x, -pointer.y) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(angle / size) % count;
}

/** Where the middle of sector `index` lies, as a unit vector from the centre (for drawing). */
export function sectorDirection(index: number, count: number): Point {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}
