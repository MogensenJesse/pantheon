// src/editor/place/EditorScreenRect.ts — screen-space rects for marquee selection
import { Box3, type Camera, type Object3D, Vector3 } from 'three';

const _box = new Box3();
const _corner = new Vector3();

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function normalizeScreenRect(x0: number, y0: number, x1: number, y1: number): ScreenRect {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

export function screenRectsIntersect(a: ScreenRect, b: ScreenRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** Project an object's world AABB to screen pixels (client coordinates). */
export function getObjectScreenRect(
  obj: Object3D,
  camera: Camera,
  canvasRect: DOMRect,
): ScreenRect | null {
  _box.setFromObject(obj);
  if (_box.isEmpty()) return null;

  const { min, max } = _box;
  const corners = [
    [min.x, min.y, min.z],
    [min.x, min.y, max.z],
    [min.x, max.y, min.z],
    [min.x, max.y, max.z],
    [max.x, min.y, min.z],
    [max.x, min.y, max.z],
    [max.x, max.y, min.z],
    [max.x, max.y, max.z],
  ] as const;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const [x, y, z] of corners) {
    _corner.set(x, y, z).project(camera);
    const sx = (_corner.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const sy = (-_corner.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
    if (sx < left) left = sx;
    if (sx > right) right = sx;
    if (sy < top) top = sy;
    if (sy > bottom) bottom = sy;
  }

  if (!Number.isFinite(left)) return null;
  return { left, top, right, bottom };
}
