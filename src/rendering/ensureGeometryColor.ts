// src/rendering/ensureGeometryColor.ts — white fallback when glTF lacks COLOR_0
import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * Nature Pack trees ship COLOR_0 (often baked AO); rocks/pebbles do not.
 * Prop shaders can always sample `attribute('color')` after this runs.
 */
export function ensureGeometryColor(geometry: BufferGeometry): void {
  if (geometry.attributes.color) return;
  const pos = geometry.attributes.position;
  if (!pos) return;
  const colors = new Float32Array(pos.count * 3);
  colors.fill(1);
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
}
