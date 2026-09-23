// src/rendering/clouds/cloudInstanceSort.ts — back-to-front instance pack for soft-sphere clouds
import type { InstancedMesh, PerspectiveCamera } from 'three';
import { Vector3 } from 'three';

/** Scratch for back-to-front sort (reused; sized on demand). */
let _sortKeys: Float32Array | null = null;
let _sortOrder: Uint32Array | null = null;
/** Particle-order matrices — wind writes here; packed into the mesh via `_sortOrder`. */
let _particleMatrices: Float32Array | null = null;
let _sortFrameCounter = 0;
let _lastSortCamX = Number.POSITIVE_INFINITY;
let _lastSortCamY = Number.POSITIVE_INFINITY;
let _lastSortCamZ = Number.POSITIVE_INFINITY;
let _sortOrderCount = 0;

/** Re-sort when the camera moves this far (m²), or every N frames. */
const CLOUD_SORT_CAM_MOVE_EPS_SQ = 2.25;
const CLOUD_SORT_EVERY_N = 3;

const _camPos = new Vector3();

export function ensureCloudSortBuffers(count: number): Float32Array {
  if (
    _sortKeys &&
    _sortKeys.length >= count &&
    _particleMatrices &&
    _particleMatrices.length >= count * 16
  ) {
    return _particleMatrices;
  }
  _sortKeys = new Float32Array(count);
  _sortOrder = new Uint32Array(count);
  _particleMatrices = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) _sortOrder[i] = i;
  _sortOrderCount = count;
  _sortFrameCounter = 0;
  _lastSortCamX = Number.POSITIVE_INFINITY;
  return _particleMatrices;
}

/** Copy one Matrix4 (16 floats) without allocating a subarray view. */
function copyMatrix16(
  dst: Float32Array,
  dstOffset: number,
  src: Float32Array,
  srcOffset: number,
): void {
  dst[dstOffset] = src[srcOffset]!;
  dst[dstOffset + 1] = src[srcOffset + 1]!;
  dst[dstOffset + 2] = src[srcOffset + 2]!;
  dst[dstOffset + 3] = src[srcOffset + 3]!;
  dst[dstOffset + 4] = src[srcOffset + 4]!;
  dst[dstOffset + 5] = src[srcOffset + 5]!;
  dst[dstOffset + 6] = src[srcOffset + 6]!;
  dst[dstOffset + 7] = src[srcOffset + 7]!;
  dst[dstOffset + 8] = src[srcOffset + 8]!;
  dst[dstOffset + 9] = src[srcOffset + 9]!;
  dst[dstOffset + 10] = src[srcOffset + 10]!;
  dst[dstOffset + 11] = src[srcOffset + 11]!;
  dst[dstOffset + 12] = src[srcOffset + 12]!;
  dst[dstOffset + 13] = src[srcOffset + 13]!;
  dst[dstOffset + 14] = src[srcOffset + 14]!;
  dst[dstOffset + 15] = src[srcOffset + 15]!;
}

function refreshSortOrder(count: number, camX: number, camY: number, camZ: number): void {
  const keys = _sortKeys!;
  const order = _sortOrder!;
  const particles = _particleMatrices!;
  for (let i = 0; i < count; i++) {
    const o = i * 16;
    const dx = particles[o + 12]! - camX;
    const dy = particles[o + 13]! - camY;
    const dz = particles[o + 14]! - camZ;
    keys[i] = dx * dx + dy * dy + dz * dz;
    order[i] = i;
  }
  order.sort((a, b) => keys[b]! - keys[a]!);
  _lastSortCamX = camX;
  _lastSortCamY = camY;
  _lastSortCamZ = camZ;
}

function packSortedInstances(mesh: InstancedMesh, count: number): void {
  const order = _sortOrder!;
  const particles = _particleMatrices!;
  const dst = mesh.instanceMatrix.array as Float32Array;
  for (let i = 0; i < count; i++) {
    copyMatrix16(dst, i * 16, particles, order[i]! * 16);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Painter's algorithm: wind always writes particle-order matrices; draw order is refreshed
 * when the camera moves or every N frames (pack still runs every frame — no flicker).
 */
export function packCloudInstancesWithOptionalSort(
  mesh: InstancedMesh,
  count: number,
  camera: PerspectiveCamera,
): void {
  if (count <= 0) return;
  ensureCloudSortBuffers(count);
  if (_sortOrderCount !== count) {
    for (let i = 0; i < count; i++) _sortOrder![i] = i;
    _sortOrderCount = count;
    _sortFrameCounter = 0;
    _lastSortCamX = Number.POSITIVE_INFINITY;
  }

  camera.getWorldPosition(_camPos);
  const dx = _camPos.x - _lastSortCamX;
  const dy = _camPos.y - _lastSortCamY;
  const dz = _camPos.z - _lastSortCamZ;
  const camMoved = dx * dx + dy * dy + dz * dz > CLOUD_SORT_CAM_MOVE_EPS_SQ;
  _sortFrameCounter += 1;
  if (camMoved || _sortFrameCounter % CLOUD_SORT_EVERY_N === 0 || !Number.isFinite(_lastSortCamX)) {
    refreshSortOrder(count, _camPos.x, _camPos.y, _camPos.z);
  }
  packSortedInstances(mesh, count);
}
