// src/world/village/render/matrixUtil.ts — instance matrix composition shared by the village batches
import { Matrix4, Quaternion, Vector3 } from 'three';

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();
const Y_AXIS = new Vector3(0, 1, 0);

/**
 * Matrix for an instance at (x, y, z) turned by `yaw` about +Y and scaled (`sx`, `sy`, `sz`; a lone
 * `sx` scales uniformly). The returned matrix is shared scratch: batches copy it, so do not keep it.
 */
export function composeYawMatrix(
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy: number = sx,
  sz: number = sx,
): Matrix4 {
  _position.set(x, y, z);
  _quaternion.setFromAxisAngle(Y_AXIS, yaw);
  _scale.set(sx, sy, sz);
  return _matrix.compose(_position, _quaternion, _scale);
}
