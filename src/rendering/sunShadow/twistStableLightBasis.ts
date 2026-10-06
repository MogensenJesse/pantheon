// src/rendering/sunShadow/twistStableLightBasis.ts — lookAt/+Y-up light frame for snap + handoff
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';

const _lightPos = new Vector3();
const _z = new Vector3();
const _refUp = new Vector3();
const _uniformBasis = { focus: new Vector3(), right: new Vector3(), up: new Vector3() };

interface TwistStableLightBasis {
  focus: Vector3;
  right: Vector3;
  up: Vector3;
}

/**
 * Twist-stable light basis matching Three's `lookAt` with world +Y up. Shared by texel snap and
 * the near→far / far→world handoffs. Three only perturbs `up` when it is exactly parallel to the
 * view axis; this swaps to +X above ~87° elevation (sun peak is 35°, so the difference is unused).
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

type Vec3Uniform = { value: unknown };

/** Copy the light's basis into handoff uniforms (identity frame when degenerate). */
export function syncLightBasisUniforms(
  light: DirectionalLight,
  uniforms: { focus: Vec3Uniform; right: Vec3Uniform; up: Vec3Uniform },
): void {
  if (!computeTwistStableLightBasis(light, _uniformBasis)) {
    _uniformBasis.focus.set(0, 0, 0);
    _uniformBasis.right.set(1, 0, 0);
    _uniformBasis.up.set(0, 0, 1);
  }
  (uniforms.focus.value as Vector3).copy(_uniformBasis.focus);
  (uniforms.right.value as Vector3).copy(_uniformBasis.right);
  (uniforms.up.value as Vector3).copy(_uniformBasis.up);
}
