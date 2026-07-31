// src/rendering/sunShadow/twistStableLightBasis.ts — lookAt/+Y-up light frame for snap + handoff
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';

const _lightPos = new Vector3();
const _z = new Vector3();
const _refUp = new Vector3();

export interface TwistStableLightBasis {
  focus: Vector3;
  right: Vector3;
  up: Vector3;
}

/**
 * Twist-stable light basis matching Three's `lookAt` with world +Y up
 * (swap to +X when looking nearly vertical). Shared by texel snap and near→far handoff.
 *
 * Writes into `out.focus` / `out.right` / `out.up` (caller-owned vectors).
 * Returns false when light and target coincide (degenerate).
 */
export function computeTwistStableLightBasis(
  light: DirectionalLight,
  out: TwistStableLightBasis,
): boolean {
  light.getWorldPosition(_lightPos);
  light.target.getWorldPosition(out.focus);

  _z.subVectors(_lightPos, out.focus);
  if (_z.lengthSq() < 1e-12) {
    return false;
  }
  _z.normalize();

  _refUp.set(0, 1, 0);
  if (Math.abs(_z.dot(_refUp)) > 0.999) {
    _refUp.set(1, 0, 0);
  }

  out.right.crossVectors(_refUp, _z).normalize();
  out.up.crossVectors(_z, out.right).normalize();
  return true;
}
