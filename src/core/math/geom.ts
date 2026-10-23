// src/core/math/geom.ts — ground-plane geometry shared by the rules (pure: no DOM, node-runnable)

/** A place on the ground (x east, z south), in metres. */
export interface XZ {
  x: number;
  z: number;
}

/** Distance on the ground between two places given as numbers (for typed-array pools). */
export const distXZ = (ax: number, az: number, bx: number, bz: number): number =>
  Math.hypot(ax - bx, az - bz);

/** Distance on the ground between two places. */
export const dist2d = (a: XZ, b: XZ): number => distXZ(a.x, a.z, b.x, b.z);

/**
 * The unit direction (x, z) a heading in degrees points to: (sin θ, cos θ), so 0° is toward +z and 270° toward -x.
 * It is the convention of the clouds, the storm fronts and the wind. Written into `out` when given.
 */
export function headingToXZ(deg: number, out: XZ = { x: 0, z: 0 }): XZ {
  const rad = (deg * Math.PI) / 180;
  out.x = Math.sin(rad);
  out.z = Math.cos(rad);
  return out;
}
