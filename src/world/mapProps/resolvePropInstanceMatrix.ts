// src/world/mapProps/resolvePropInstanceMatrix.ts — shared prop placement matrix (surface Y + foot snap)
import { Box3, Matrix4, type Object3D, Quaternion, Vector3 } from 'three';
import { VISUAL } from '../../config/visualTuning';
import type { PropTerrainSurface } from '../terrain/cpu/terrainSurfaceCpu';
import type { MapPropPlacement } from './mapPropPlacement';
import { composePropWorldQuaternion } from './mapPropTerrainAlign';

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _terrainNormal = new Vector3();
const _footWorld = new Vector3();
const _bounds = new Box3();

/** Bottom-center of the GLTF model bounds in local space (shared across submeshes). */
export function computeModelFootLocal(modelScene: Object3D, target = new Vector3()): Vector3 {
  _bounds.setFromObject(modelScene);
  if (_bounds.isEmpty()) return target.set(0, 0, 0);
  return target.set(
    (_bounds.min.x + _bounds.max.x) * 0.5,
    _bounds.min.y,
    (_bounds.min.z + _bounds.max.z) * 0.5,
  );
}

/**
 * Instance matrix for a map prop: surface-aligned Y, slope tilt, model-level foot snap.
 * All props (trees included) lift so model bounds bottom sits on the sampled surface.
 */
export function resolvePropInstanceMatrix(
  placement: MapPropPlacement,
  surface: PropTerrainSurface,
  alignToSlope: boolean,
  modelFootLocal: Vector3,
  outMatrix: Matrix4,
): void {
  const surfaceY =
    surface.sampleSurfaceY(placement.x, placement.z) +
    placement.surfaceLift -
    VISUAL.props.surfaceSinkM;

  if (alignToSlope) {
    const normal = surface.sampleSurfaceNormal(placement.x, placement.z, _terrainNormal);
    composePropWorldQuaternion(_quat, normal, placement.yRotation, true);
  } else {
    composePropWorldQuaternion(_quat, _terrainNormal, placement.yRotation, false);
  }

  _scl.setScalar(placement.scale);
  _pos.set(placement.x, 0, placement.z);
  _matrix.compose(_pos, _quat, _scl);
  _footWorld.copy(modelFootLocal).applyMatrix4(_matrix);
  _pos.y = surfaceY - _footWorld.y;
  outMatrix.compose(_pos, _quat, _scl);
}
