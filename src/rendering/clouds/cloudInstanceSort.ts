// src/rendering/clouds/cloudInstanceSort.ts - back-to-front instance pack for soft-sphere clouds
import type { InstancedMesh, PerspectiveCamera } from 'three';
import { DynamicDrawUsage, InstancedBufferAttribute, Vector3 } from 'three';

/** Scratch for back-to-front sort (reused; sized on demand). */
let _sortKeys: Float32Array | null = null;
let _sortOrder: Uint32Array | null = null;
/** Particle-order matrices — wind writes here; packed into the mesh via `_sortOrder`. */
let _particleMatrices: Float32Array | null = null;
/** Particle-order aCloudMass (vec4) — wind writes here; packed with matrices. */
let _particleMass: Float32Array | null = null;
/** Particle-order aDeckClip (vec2): x = bank-shared deck world Y, y = clip enable. */
let _particleDeckClip: Float32Array | null = null;
/** Particle-order aPuffScale (vec3): instance radii in meters. Boil/grow are unit-sphere offsets. */
let _particleScale: Float32Array | null = null;
/** Particle-order aPuffOrigin (vec2): cloud-anchor world XZ. Life noise samples this once per cloud. */
let _particleOrigin: Float32Array | null = null;
let _sortFrameCounter = 0;
let _lastSortCamX = Number.POSITIVE_INFINITY;
let _lastSortCamY = Number.POSITIVE_INFINITY;
let _lastSortCamZ = Number.POSITIVE_INFINITY;
let _sortOrderCount = 0;

/** Re-sort when the camera moves this far (m²), or every N frames. */
const CLOUD_SORT_CAM_MOVE_EPS_SQ = 2.25;
const CLOUD_SORT_EVERY_N = 3;

const _camPos = new Vector3();

/**
 * Ensure mesh has an `aCloudMass` InstancedBufferAttribute (vec4) sized for `count`.
 * Returns the underlying Float32Array for direct writes (proxy / init path).
 */
export function ensureCloudMassAttribute(mesh: InstancedMesh, count: number): Float32Array {
  const existing = mesh.geometry.getAttribute('aCloudMass') as InstancedBufferAttribute | undefined;
  if (existing && existing.array instanceof Float32Array && existing.array.length >= count * 4) {
    return existing.array as Float32Array;
  }
  const array = new Float32Array(Math.max(count, 1) * 4);
  // Degenerate default: +Y mass normal. w is horizontal extent; a large value stays solid.
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    array[o] = 0;
    array[o + 1] = 1;
    array[o + 2] = 0;
    array[o + 3] = 1000;
  }
  const attr = new InstancedBufferAttribute(array, 4);
  attr.setUsage(DynamicDrawUsage);
  mesh.geometry.setAttribute('aCloudMass', attr);
  return array;
}

/**
 * Ensure mesh has an `aDeckClip` InstancedBufferAttribute (vec2) sized for count.
 * x = bank-shared condensation deck world Y; y = 1 to hard-clip below the deck.
 */
export function ensureCloudDeckClipAttribute(mesh: InstancedMesh, count: number): Float32Array {
  const existing = mesh.geometry.getAttribute('aDeckClip') as InstancedBufferAttribute | undefined;
  if (existing && existing.array instanceof Float32Array && existing.array.length >= count * 2) {
    return existing.array as Float32Array;
  }
  const array = new Float32Array(Math.max(count, 1) * 2);
  const attr = new InstancedBufferAttribute(array, 2);
  attr.setUsage(DynamicDrawUsage);
  mesh.geometry.setAttribute('aDeckClip', attr);
  return array;
}

/** Instance radii (sx, sy, sz) in meters. Life motion is authored on the unit sphere. */
export function ensureCloudPuffScaleAttribute(mesh: InstancedMesh, count: number): Float32Array {
  const existing = mesh.geometry.getAttribute('aPuffScale') as InstancedBufferAttribute | undefined;
  if (existing && existing.array instanceof Float32Array && existing.array.length >= count * 3) {
    return existing.array as Float32Array;
  }
  const array = new Float32Array(Math.max(count, 1) * 3);
  const attr = new InstancedBufferAttribute(array, 3);
  attr.setUsage(DynamicDrawUsage);
  mesh.geometry.setAttribute('aPuffScale', attr);
  return array;
}

/** Puff-center world XZ. The life-noise sample is shared by every vertex of the puff. */
export function ensureCloudPuffOriginAttribute(mesh: InstancedMesh, count: number): Float32Array {
  const existing = mesh.geometry.getAttribute('aPuffOrigin') as
    | InstancedBufferAttribute
    | undefined;
  if (existing && existing.array instanceof Float32Array && existing.array.length >= count * 2) {
    return existing.array as Float32Array;
  }
  const array = new Float32Array(Math.max(count, 1) * 2);
  const attr = new InstancedBufferAttribute(array, 2);
  attr.setUsage(DynamicDrawUsage);
  mesh.geometry.setAttribute('aPuffOrigin', attr);
  return array;
}

export function ensureCloudSortBuffers(count: number): Float32Array {
  if (
    _sortKeys &&
    _sortKeys.length >= count &&
    _particleMatrices &&
    _particleMatrices.length >= count * 16 &&
    _particleMass &&
    _particleMass.length >= count * 4 &&
    _particleDeckClip &&
    _particleDeckClip.length >= count * 2 &&
    _particleScale &&
    _particleScale.length >= count * 3 &&
    _particleOrigin &&
    _particleOrigin.length >= count * 2
  ) {
    return _particleMatrices;
  }
  _sortKeys = new Float32Array(count);
  _sortOrder = new Uint32Array(count);
  _particleMatrices = new Float32Array(count * 16);
  _particleMass = new Float32Array(count * 4);
  _particleDeckClip = new Float32Array(count * 2);
  _particleScale = new Float32Array(count * 3);
  _particleOrigin = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) _sortOrder[i] = i;
  _sortOrderCount = count;
  _sortFrameCounter = 0;
  _lastSortCamX = Number.POSITIVE_INFINITY;
  return _particleMatrices;
}

/** Particle-order mass scratch; call after `ensureCloudSortBuffers`. */
export function getCloudMassSortBuffer(): Float32Array {
  if (!_particleMass) {
    throw new Error('getCloudMassSortBuffer: call ensureCloudSortBuffers(count) first');
  }
  return _particleMass;
}

/** Particle-order deck-clip scratch; call after `ensureCloudSortBuffers`. */
export function getCloudDeckClipSortBuffer(): Float32Array {
  if (!_particleDeckClip) {
    throw new Error('getCloudDeckClipSortBuffer: call ensureCloudSortBuffers(count) first');
  }
  return _particleDeckClip;
}

/** Particle-order puff radii; call after `ensureCloudSortBuffers`. */
export function getCloudPuffScaleSortBuffer(): Float32Array {
  if (!_particleScale) {
    throw new Error('getCloudPuffScaleSortBuffer: call ensureCloudSortBuffers(count) first');
  }
  return _particleScale;
}

/** Particle-order puff centers; call after `ensureCloudSortBuffers`. */
export function getCloudPuffOriginSortBuffer(): Float32Array {
  if (!_particleOrigin) {
    throw new Error('getCloudPuffOriginSortBuffer: call ensureCloudSortBuffers(count) first');
  }
  return _particleOrigin;
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

function copyVec4(
  dst: Float32Array,
  dstOffset: number,
  src: Float32Array,
  srcOffset: number,
): void {
  dst[dstOffset] = src[srcOffset]!;
  dst[dstOffset + 1] = src[srcOffset + 1]!;
  dst[dstOffset + 2] = src[srcOffset + 2]!;
  dst[dstOffset + 3] = src[srcOffset + 3]!;
}

function copyVec2(
  dst: Float32Array,
  dstOffset: number,
  src: Float32Array,
  srcOffset: number,
): void {
  dst[dstOffset] = src[srcOffset]!;
  dst[dstOffset + 1] = src[srcOffset + 1]!;
}

function copyVec3(
  dst: Float32Array,
  dstOffset: number,
  src: Float32Array,
  srcOffset: number,
): void {
  dst[dstOffset] = src[srcOffset]!;
  dst[dstOffset + 1] = src[srcOffset + 1]!;
  dst[dstOffset + 2] = src[srcOffset + 2]!;
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
  // Prefix only — the scratch buffer can be larger than `count` after a shrink.
  order.subarray(0, count).sort((a, b) => keys[b]! - keys[a]!);
  _lastSortCamX = camX;
  _lastSortCamY = camY;
  _lastSortCamZ = camZ;
}

function packSortedInstances(mesh: InstancedMesh, count: number): void {
  const order = _sortOrder!;
  const particles = _particleMatrices!;
  const massSrc = _particleMass!;
  const deckSrc = _particleDeckClip!;
  const scaleSrc = _particleScale!;
  const originSrc = _particleOrigin!;
  const dst = mesh.instanceMatrix.array as Float32Array;
  const massDst = ensureCloudMassAttribute(mesh, count);
  const deckDst = ensureCloudDeckClipAttribute(mesh, count);
  const scaleDst = ensureCloudPuffScaleAttribute(mesh, count);
  const originDst = ensureCloudPuffOriginAttribute(mesh, count);
  for (let i = 0; i < count; i++) {
    const src = order[i]!;
    copyMatrix16(dst, i * 16, particles, src * 16);
    copyVec4(massDst, i * 4, massSrc, src * 4);
    copyVec2(deckDst, i * 2, deckSrc, src * 2);
    copyVec3(scaleDst, i * 3, scaleSrc, src * 3);
    copyVec2(originDst, i * 2, originSrc, src * 2);
  }
  mesh.instanceMatrix.needsUpdate = true;
  const massAttr = mesh.geometry.getAttribute('aCloudMass');
  if (massAttr) massAttr.needsUpdate = true;
  const deckAttr = mesh.geometry.getAttribute('aDeckClip');
  if (deckAttr) deckAttr.needsUpdate = true;
  const scaleAttr = mesh.geometry.getAttribute('aPuffScale');
  if (scaleAttr) scaleAttr.needsUpdate = true;
  const originAttr = mesh.geometry.getAttribute('aPuffOrigin');
  if (originAttr) originAttr.needsUpdate = true;
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

/**
 * Re-pack painter order from the last wind write when the camera has moved past the
 * sort epsilon. Does not upload when the camera is still. Returns false when the
 * particle-order scratch was never filled for `count` (caller should run wind).
 */
export function repackCloudInstancesIfCameraMoved(
  mesh: InstancedMesh,
  count: number,
  camera: PerspectiveCamera,
): boolean {
  if (
    count <= 0 ||
    !_particleMatrices ||
    !_sortOrder ||
    _sortOrderCount !== count ||
    _particleMatrices.length < count * 16
  ) {
    return false;
  }

  camera.getWorldPosition(_camPos);
  const dx = _camPos.x - _lastSortCamX;
  const dy = _camPos.y - _lastSortCamY;
  const dz = _camPos.z - _lastSortCamZ;
  const camMoved = dx * dx + dy * dy + dz * dz > CLOUD_SORT_CAM_MOVE_EPS_SQ;
  if (!camMoved && Number.isFinite(_lastSortCamX)) return true;

  refreshSortOrder(count, _camPos.x, _camPos.y, _camPos.z);
  packSortedInstances(mesh, count);
  return true;
}
