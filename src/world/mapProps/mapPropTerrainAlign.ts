// src/world/mapProps/mapPropTerrainAlign.ts — slope-align map props to terrain surface normal
import { Matrix4, Quaternion, Vector3 } from 'three';
import { WORLD } from '../WorldConfig';
import { PROP_TREE_KEYS } from './propShadowKeys';

const _up = new Vector3(0, 1, 0);
const _normal = new Vector3();
const _heading = new Vector3();
const _tangent = new Vector3();
const _right = new Vector3();
const _forward = new Vector3();
const _basis = new Matrix4();

/** Trees stay upright; rocks, plants, pebbles, etc. follow terrain slope. */
export function propAlignsToTerrainSlope(key: string): boolean {
  return !PROP_TREE_KEYS.has(key);
}

export function terrainNormalSampleStepM(gridSize?: number): number {
  const cells = gridSize ?? WORLD.SEGMENTS;
  return WORLD.SIZE / Math.max(1, cells - 1);
}

/** Central-difference normal from a height field (matches terrain mesh vertex normals). */
export function sampleTerrainNormalFromHeight(
  getWorldY: (x: number, z: number) => number,
  x: number,
  z: number,
  sampleStepM: number,
  target = new Vector3(),
): Vector3 {
  const hL = getWorldY(x - sampleStepM, z);
  const hR = getWorldY(x + sampleStepM, z);
  const hD = getWorldY(x, z - sampleStepM);
  const hU = getWorldY(x, z + sampleStepM);
  const dhdx = (hR - hL) / (2 * sampleStepM);
  const dhdz = (hU - hD) / (2 * sampleStepM);
  const nx = -dhdx;
  const ny = 1;
  const nz = -dhdz;
  const len = Math.hypot(nx, ny, nz) || 1;
  return target.set(nx / len, ny / len, nz / len);
}

function projectHeadingOntoTangentPlane(
  heading: Vector3,
  normal: Vector3,
  target: Vector3,
): Vector3 {
  const dot = heading.dot(normal);
  target.copy(heading).addScaledVector(normal, -dot);
  if (target.lengthSq() < 1e-8) {
    target.set(1, 0, 0);
    const fallbackDot = target.dot(normal);
    target.addScaledVector(normal, -fallbackDot);
  }
  return target.normalize();
}

/**
 * World orientation for a prop: tilt local Y to terrain normal while preserving authored
 * rotY as heading on the slope (avoids setFromUnitVectors roll that flips flat rocks ~90°).
 */
export function composePropWorldQuaternion(
  out: Quaternion,
  terrainNormal: Vector3,
  yRotation: number,
  alignToSlope: boolean,
): Quaternion {
  if (!alignToSlope) {
    return out.setFromAxisAngle(_up, yRotation);
  }

  _normal.copy(terrainNormal).normalize();
  if (_normal.y < 0.001) {
    return out.setFromAxisAngle(_up, yRotation);
  }

  _heading.set(Math.sin(yRotation), 0, Math.cos(yRotation));
  projectHeadingOntoTangentPlane(_heading, _normal, _tangent);
  _right.crossVectors(_normal, _tangent).normalize();
  _forward.crossVectors(_right, _normal).normalize();
  _basis.makeBasis(_right, _normal, _forward);
  return out.setFromRotationMatrix(_basis);
}
