// src/world/village/assets/placeholder/kitUtil.ts — helpers shared by the placeholder kit builders
import type { BufferGeometry } from 'three';
import type { MeshBuilder } from './meshBuilder.ts';
import { PALETTE as P } from './palette.ts';

/** lod0, lod1, lod2 geometries of one asset. */
export type LodGeometries = readonly [BufferGeometry, BufferGeometry, BufferGeometry];
/** 0 most detailed (lod0) .. 2 coarsest. */
export type Detail = 0 | 1 | 2;

/** One geometry per level of detail, finest first. */
export function lodsOf(build: (detail: Detail) => BufferGeometry): LodGeometries {
  return [build(0), build(1), build(2)];
}

/** The same geometry for every level (assets with no cheaper variant). */
export function alias(geometry: BufferGeometry): LodGeometries {
  return [geometry, geometry, geometry];
}

/** Glow quads float this far in front of the window they light (m), beyond the window's own offset. */
const GLOW_OFFSET = 0.06;

/**
 * A lit-window quad for a window centred `along` the wall at height `y`, on the wall plane `half`
 * metres out. Call inside `builder.within(...)` so it follows the wall's yaw.
 */
export function windowGlowQuad(
  b: MeshBuilder,
  along: number,
  y: number,
  width: number,
  height: number,
  half: number,
): void {
  const x0 = along - width / 2;
  const x1 = along + width / 2;
  const z = half + 0.05 + GLOW_OFFSET;
  b.quad([x0, y, z], [x1, y, z], [x1, y + height, z], [x0, y + height, z], P.glow);
}
