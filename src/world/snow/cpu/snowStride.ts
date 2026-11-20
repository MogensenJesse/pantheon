// src/world/snow/cpu/snowStride.ts — footprints at an even stride along a path, whatever the frame rate
//
// A mover that is drawn once a frame covers different distances per frame; stamping one print per frame would leave gaps at
// low fps and bunch up at high. This walks the segment since the last print and emits one every `strideM`, carrying the
// remainder. A jump of more than `maxStamps` strides (a teleport, a camera cut) is not a path: one print at the end.
// Pure: no imports.

export interface StridePoint {
  x: number;
  z: number;
}

/**
 * Emits the prints between `last` and `to` (heading = direction of travel) and advances `last` to the last one.
 * `last` with a NaN x means no print yet: `to` becomes the start and nothing is emitted. Returns the count.
 */
export function walkStride(
  last: StridePoint,
  to: StridePoint,
  strideM: number,
  maxStamps: number,
  emit: (x: number, z: number, dirX: number, dirZ: number) => void,
): number {
  if (Number.isNaN(last.x)) {
    last.x = to.x;
    last.z = to.z;
    return 0;
  }
  const dx = to.x - last.x;
  const dz = to.z - last.z;
  const dist = Math.hypot(dx, dz);
  if (dist < strideM) return 0;
  const dirX = dx / dist;
  const dirZ = dz / dist;
  if (dist > maxStamps * strideM) {
    last.x = to.x;
    last.z = to.z;
    emit(to.x, to.z, dirX, dirZ);
    return 1;
  }
  const n = Math.floor(dist / strideM);
  for (let k = 1; k <= n; k++) {
    emit(last.x + dirX * strideM * k, last.z + dirZ * strideM * k, dirX, dirZ);
  }
  last.x += dirX * strideM * n;
  last.z += dirZ * strideM * n;
  return n;
}
