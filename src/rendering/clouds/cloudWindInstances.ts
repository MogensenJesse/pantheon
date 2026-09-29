// src/rendering/clouds/cloudWindInstances.ts - wind drift, terrain lift, and instance TRS for mesh clouds
import { type InstancedMesh, type PerspectiveCamera, Sphere } from 'three';
import type { CloudSettings } from './cloudConfig';
import {
  ensureCloudDeckClipAttribute,
  ensureCloudMassAttribute,
  ensureCloudPuffOriginAttribute,
  ensureCloudPuffScaleAttribute,
  ensureCloudSortBuffers,
  getCloudDeckClipSortBuffer,
  getCloudMassSortBuffer,
  getCloudPuffOriginSortBuffer,
  getCloudPuffScaleSortBuffer,
  packCloudInstancesWithOptionalSort,
} from './cloudInstanceSort';
import { readCumulusDeck } from './cumulusDeck';
import type { CloudClusterPlacement, CloudParticlePlacement } from './generateCloudField';

/** World-units drift per second at windSpeed = 1. Shared with the SkyMesh travel scale. */
export const WIND_TRAVEL_SCALE = 0.1;
/** Subtle oscillation amplitude (m) along wind axis. */
const WIND_SWAY_AMP = 5;
const WIND_SWAY_FREQ = 0.01;

/** Along-wind offset (m): steady travel plus sway. Shared with the cloud-cast refresh. */
export function cloudWindDriftMeters(elapsed: number, windSpeed: number): number {
  const travel = elapsed * windSpeed * WIND_TRAVEL_SCALE;
  const sway = Math.sin(elapsed * windSpeed * WIND_SWAY_FREQ) * WIND_SWAY_AMP;
  return travel + sway;
}

/** Pad after live AABB so soft edges / sway never sit on the cull boundary. */
const CLOUD_BOUNDS_MARGIN_M = 40;

/** Toroidal wrap in world XZ around the field origin (keeps clouds over the play area). */
function wrapAxis(value: number, spread: number): number {
  const half = spread * 0.5;
  let v = value;
  while (v > half) v -= spread;
  while (v < -half) v += spread;
  return v;
}

/**
 * Visit each cluster anchor (world XZ after wind wrap) once.
 * `visit` returns false to stop. Result is the cluster count, or -1 if stopped.
 */
function forEachClusterAnchor(
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
  visit: (index: number, x: number, z: number) => boolean | undefined,
): number {
  const drift = cloudWindDriftMeters(elapsed, settings.windSpeed);
  const rad = (settings.windDirectionDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = Math.cos(rad);
  const spread = settings.spread;
  let n = 0;
  let last = -1;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!;
    if (p.cloudIndex === last) continue;
    last = p.cloudIndex;
    const keep = visit(
      n,
      wrapAxis(p.clusterX + dirX * drift, spread),
      wrapAxis(p.clusterZ + dirZ * drift, spread),
    );
    n += 1;
    if (keep === false) return -1;
  }
  return n;
}

/** Record per-cluster terrain Y at the anchors {@link applyWindToCloudInstances} samples. */
export function writeClusterTerrainLiftYs(
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
  getWorldY: (x: number, z: number) => number,
  out: Float32Array,
): number {
  return forEachClusterAnchor(particles, elapsed, settings, (index, x, z) => {
    out[index] = getWorldY(x, z);
    return true;
  });
}

/** True when cached terrain Y still matches a fresh sample at the same anchors. */
const TERRAIN_LIFT_MATCH_EPS_M = 1e-3;

export function clusterTerrainLiftMatches(
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
  getWorldY: (x: number, z: number) => number,
  cached: Float32Array,
  cachedCount: number,
): boolean {
  const n = forEachClusterAnchor(particles, elapsed, settings, (index, x, z) => {
    if (index >= cachedCount) return false;
    if (Math.abs(cached[index]! - getWorldY(x, z)) > TERRAIN_LIFT_MATCH_EPS_M) return false;
    return true;
  });
  return n === cachedCount;
}

/**
 * Write TRS into instanceMatrix.array: yaw so local +X/+Z align with wind/crosswind.
 * Column-major Three.js Matrix4 = R_y * Scale(sx, sy, sz).
 * windDirXZ = (sin θ, cos θ) matches travel drift.
 */
function writeInstanceMatrix(
  array: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  windDirX: number,
  windDirZ: number,
): void {
  const o = index * 16;
  // Basis: X = wind, Z = crosswind (−dirZ, dirX), Y = up.
  const cx = -windDirZ;
  const cz = windDirX;
  array[o] = windDirX * sx;
  array[o + 1] = 0;
  array[o + 2] = windDirZ * sx;
  array[o + 3] = 0;
  array[o + 4] = 0;
  array[o + 5] = sy;
  array[o + 6] = 0;
  array[o + 7] = 0;
  array[o + 8] = cx * sz;
  array[o + 9] = 0;
  array[o + 10] = cz * sz;
  array[o + 11] = 0;
  array[o + 12] = x;
  array[o + 13] = y;
  array[o + 14] = z;
  array[o + 15] = 1;
}

/**
 * aCloudMass: xyz = wind-local offset / cluster extents, rotated into world XZ;
 * w = cluster horizontal extent, max(extentX, extentZ), shared by every puff.
 */
function writeCloudMass(
  array: Float32Array,
  index: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  extentX: number,
  extentY: number,
  extentZ: number,
  windDirX: number,
  windDirZ: number,
  horizontalExtent: number,
): void {
  const o = index * 4;
  const mx = offsetX / extentX;
  const my = offsetY / extentY;
  const mz = offsetZ / extentZ;
  // Rotate wind-local XZ into world (same basis as instance yaw).
  const crossX = -windDirZ;
  const crossZ = windDirX;
  const worldMx = mx * windDirX + mz * crossX;
  const worldMz = mx * windDirZ + mz * crossZ;
  // Degenerate (proxy at center): default mass normal to +Y.
  if (worldMx * worldMx + my * my + worldMz * worldMz < 1e-8) {
    array[o] = 0;
    array[o + 1] = 1;
    array[o + 2] = 0;
    array[o + 3] = horizontalExtent;
    return;
  }
  array[o] = worldMx;
  array[o + 1] = my;
  array[o + 2] = worldMz;
  array[o + 3] = horizontalExtent;
}

/** aDeckClip: x = bank-shared condensation deck world Y; y = 1 to hard-clip below the deck. */
function writeCloudDeckClip(
  array: Float32Array,
  index: number,
  bankDeckY: number,
  clipEnable: number,
): void {
  const o = index * 2;
  array[o] = bankDeckY;
  array[o + 1] = clipEnable;
}

/** aPuffScale: instance radii in meters (sx, sy, sz). */
function writePuffScale(
  array: Float32Array,
  index: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const o = index * 3;
  array[o] = sx;
  array[o + 1] = sy;
  array[o + 2] = sz;
}

/** aPuffOrigin: cloud-anchor world XZ, shared by every puff in the cloud. */
function writePuffOrigin(array: Float32Array, index: number, worldX: number, worldZ: number): void {
  const o = index * 2;
  array[o] = worldX;
  array[o + 1] = worldZ;
}

/**
 * Frustum sphere from live instance AABB (centers +/- max axis scale).
 * Formula-from-spread under-covered Phase 1 high layer (~400 m) and cluster-local
 * offsets outside the wrap box — edge instances popped when the mesh sphere left the frustum.
 */
function updateCloudBoundingSphere(
  mesh: InstancedMesh,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  if (!mesh.boundingSphere) {
    mesh.boundingSphere = new Sphere();
  }
  const sphere = mesh.boundingSphere;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const hx = maxX - cx;
  const hy = maxY - cy;
  const hz = maxZ - cz;
  sphere.center.set(cx, cy, cz);
  sphere.radius = Math.sqrt(hx * hx + hy * hy + hz * hz) + CLOUD_BOUNDS_MARGIN_M;
}

function clusterWindMotion(
  clusters: readonly CloudClusterPlacement[],
  cloudIndex: number,
): CloudClusterPlacement | undefined {
  const direct = clusters[cloudIndex];
  if (direct?.index === cloudIndex) return direct;
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i]!.index === cloudIndex) return clusters[i];
  }
  return undefined;
}

export function applyWindToCloudInstances(
  mesh: InstancedMesh,
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
  getWorldY: ((x: number, z: number) => number) | null,
  camera: PerspectiveCamera | null,
  clusters: readonly CloudClusterPlacement[] = [],
): void {
  const count = particles.length;
  if (count === 0) return;

  const rad = (settings.windDirectionDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = Math.cos(rad);
  const crossX = -dirZ;
  const crossZ = dirX;
  const drift = cloudWindDriftMeters(elapsed, settings.windSpeed);
  const clearance = settings.terrainClearanceM;
  const deckBiasM = readCumulusDeck().deckYBiasM;
  let clipDeck = false;

  // Main-pass (camera set): write particle-order scratch then pack via throttled sort.
  // Proxy / init (no camera): write straight into the mesh — do not touch shared sort buffers.
  const useSortPath = camera !== null;
  const array = useSortPath
    ? ensureCloudSortBuffers(count)
    : (mesh.instanceMatrix.array as Float32Array);
  const massArray = useSortPath ? getCloudMassSortBuffer() : ensureCloudMassAttribute(mesh, count);
  const deckArray = useSortPath
    ? getCloudDeckClipSortBuffer()
    : ensureCloudDeckClipAttribute(mesh, count);
  const scaleArray = useSortPath
    ? getCloudPuffScaleSortBuffer()
    : ensureCloudPuffScaleAttribute(mesh, count);
  const originArray = useSortPath
    ? getCloudPuffOriginSortBuffer()
    : ensureCloudPuffOriginAttribute(mesh, count);

  // Particles are authored contiguously per cluster — sample terrain once per cluster.
  let lastCloudIndex = -1;
  let clusterTerrainY = 0;
  /** One condensation Y for the whole cluster — not per-puff equator / worldY-offsetY. */
  let bankLocalDeckY = 0;
  let bankDeckY = 0;
  let extentX = 1;
  let extentY = 1;
  let extentZ = 1;
  // Live AABB for InstancedMesh frustum sphere (unit sphere → reach = max scale axis).
  let boundMinX = Number.POSITIVE_INFINITY;
  let boundMinY = Number.POSITIVE_INFINITY;
  let boundMinZ = Number.POSITIVE_INFINITY;
  let boundMaxX = Number.NEGATIVE_INFINITY;
  let boundMaxY = Number.NEGATIVE_INFINITY;
  let boundMaxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < count; i++) {
    const p = particles[i]!;
    // Offsets authored in wind-local frame (+X along-wind, +Z crosswind).
    const ox = p.offsetX;
    const oz = p.offsetZ;
    const localX = ox * dirX + oz * crossX;
    const localZ = ox * dirZ + oz * crossZ;
    const wx = wrapAxis(p.clusterX + dirX * drift, settings.spread);
    const wz = wrapAxis(p.clusterZ + dirZ * drift, settings.spread);
    // Designer group offset, wind-local, after wrap. 0 when unset (play).
    const gx = p.groupOffsetX ?? 0;
    const gz = p.groupOffsetZ ?? 0;
    const groupX = gx * dirX + gz * crossX;
    const groupZ = gx * dirZ + gz * crossZ;
    const worldX = wx + localX + groupX;
    const worldZ = wz + localZ + groupZ;
    let worldY = p.clusterY + p.offsetY;

    if (p.cloudIndex !== lastCloudIndex) {
      lastCloudIndex = p.cloudIndex;
      const motion = clusterWindMotion(clusters, p.cloudIndex);
      if (motion) {
        extentX = motion.extentX;
        extentY = motion.extentY;
        extentZ = motion.extentZ;
        bankLocalDeckY = motion.localDeckY;
        clipDeck = motion.clipDeck;
      } else {
        extentX = 0.001;
        extentY = 0.001;
        extentZ = 0.001;
        bankLocalDeckY = 0;
        clipDeck = true;
      }
      if (settings.terrainInteractionEnabled && getWorldY) {
        clusterTerrainY = getWorldY(wx, wz);
      }
      // Flat underside stays at deck altitude. Puff centers lift on their own.
      bankDeckY = p.clusterY + bankLocalDeckY + (clipDeck ? deckBiasM : 0);
    }

    if (settings.terrainInteractionEnabled && getWorldY) {
      const minY = clusterTerrainY + clearance;
      if (worldY < minY) worldY = minY;
    }

    const clipOn = clipDeck ? 1 : 0;
    // Cull puffs whose mass sits almost entirely below the bank deck.
    const underDeck = clipOn > 0 && p.offsetY + p.scaleY * 0.2 < bankLocalDeckY;
    const sx = underDeck ? 0 : p.scaleX;
    const sy = underDeck ? 0 : p.scaleY;
    const sz = underDeck ? 0 : p.scaleZ;
    writeInstanceMatrix(array, i, worldX, worldY, worldZ, sx, sy, sz, dirX, dirZ);
    writeCloudMass(
      massArray,
      i,
      ox,
      p.offsetY,
      oz,
      extentX,
      extentY,
      extentZ,
      dirX,
      dirZ,
      Math.max(extentX, extentZ),
    );
    writeCloudDeckClip(deckArray, i, bankDeckY, clipOn);
    writePuffScale(scaleArray, i, sx, sy, sz);
    writePuffOrigin(originArray, i, wx + groupX, wz + groupZ);

    const reach = Math.max(p.scaleX, p.scaleY, p.scaleZ);
    if (worldX - reach < boundMinX) boundMinX = worldX - reach;
    if (worldY - reach < boundMinY) boundMinY = worldY - reach;
    if (worldZ - reach < boundMinZ) boundMinZ = worldZ - reach;
    if (worldX + reach > boundMaxX) boundMaxX = worldX + reach;
    if (worldY + reach > boundMaxY) boundMaxY = worldY + reach;
    if (worldZ + reach > boundMaxZ) boundMaxZ = worldZ + reach;
  }

  if (useSortPath) {
    packCloudInstancesWithOptionalSort(mesh, count, camera!);
  } else {
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
  updateCloudBoundingSphere(mesh, boundMinX, boundMinY, boundMinZ, boundMaxX, boundMaxY, boundMaxZ);
}
