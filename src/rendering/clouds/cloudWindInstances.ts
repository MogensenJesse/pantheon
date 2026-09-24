// src/rendering/clouds/cloudWindInstances.ts - wind drift, terrain lift, instance TRS for mesh clouds
import { type InstancedMesh, type PerspectiveCamera, Sphere } from 'three';
import type { CloudSettings } from './cloudConfig';
import { getCloudGenusProfile } from './cloudGenusProfiles';
import {
  ensureCloudDeckClipAttribute,
  ensureCloudMassAttribute,
  ensureCloudSortBuffers,
  getCloudDeckClipSortBuffer,
  getCloudMassSortBuffer,
  packCloudInstancesWithOptionalSort,
} from './cloudInstanceSort';
import { genusUsesCondensationClip } from './cloudProfiles';
import type { CloudParticlePlacement } from './generateCloudField';

/** World-units drift per second at windSpeed = 1. */
const WIND_TRAVEL_SCALE = 0.1;
/** Subtle oscillation amplitude (m) along wind axis. */
const WIND_SWAY_AMP = 5;
const WIND_SWAY_FREQ = 0.01;

/** Pad after live AABB so soft edges / sway never sit on the cull boundary. */
const CLOUD_BOUNDS_MARGIN_M = 40;

/** Reused when computing bank condensation Y from cluster puff centers (no per-frame alloc). */
let _deckCenterScratch: Float32Array | null = null;

/**
 * Approximate low percentile of puff center local-Y (insertion into a small sorted prefix).
 * Used so the bank clip plane sits in the mass underside (P20-P30), not under the ribs at local 0.
 */
function deckCenterPercentile(values: Float32Array, count: number, pct: number): number {
  if (count <= 0) return 0;
  if (count === 1) return values[0]!;
  const target = Math.min(count - 1, Math.max(0, Math.floor(count * pct)));
  // Partial selection sort up to target - clusters are small (tens of puffs).
  for (let i = 0; i <= target; i++) {
    let minIdx = i;
    let minVal = values[i]!;
    for (let j = i + 1; j < count; j++) {
      const v = values[j]!;
      if (v < minVal) {
        minVal = v;
        minIdx = j;
      }
    }
    if (minIdx !== i) {
      values[minIdx] = values[i]!;
      values[i] = minVal;
    }
  }
  return values[target]!;
}

/** Toroidal wrap in world XZ around the field origin (keeps clouds over the play area). */
function wrapAxis(value: number, spread: number): number {
  const half = spread * 0.5;
  let v = value;
  while (v > half) v -= spread;
  while (v < -half) v += spread;
  return v;
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
 * w = life fade (1 until Phase 3 lifecycle).
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
  lifeFade: number,
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
    array[o + 3] = lifeFade;
    return;
  }
  array[o] = worldMx;
  array[o + 1] = my;
  array[o + 2] = worldMz;
  array[o + 3] = lifeFade;
}

/** aDeckClip: x = bank-shared condensation deck world Y; y = 1 clip (cumulus/stratus), 0 = cirrus off. */
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

export function applyWindToCloudInstances(
  mesh: InstancedMesh,
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
  getWorldY: ((x: number, z: number) => number) | null,
  camera: PerspectiveCamera | null,
): void {
  const count = particles.length;
  if (count === 0) return;

  const rad = (settings.windDirectionDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = Math.cos(rad);
  const crossX = -dirZ;
  const crossZ = dirX;
  const travel = elapsed * settings.windSpeed * WIND_TRAVEL_SCALE;
  const sway = Math.sin(elapsed * settings.windSpeed * WIND_SWAY_FREQ) * WIND_SWAY_AMP;
  // High layer opts out via layers.high.terrainLift; global toggle still gates all lift.
  let lastLiftLayer: string | null = null;
  let layerAllowsLift = true;
  const clearance = settings.terrainClearanceM;

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
    const wx = wrapAxis(p.clusterX + dirX * travel + dirX * sway, settings.spread);
    const wz = wrapAxis(p.clusterZ + dirZ * travel + dirZ * sway, settings.spread);
    const worldX = wx + localX;
    const worldZ = wz + localZ;
    let worldY = p.clusterY + p.offsetY;

    if (p.cloudIndex !== lastCloudIndex) {
      lastCloudIndex = p.cloudIndex;
      // Cluster extents from wind-local offsets + half-scale (covers puff volume).
      let ex = 0.001;
      let ey = 0.001;
      let ez = 0.001;
      for (let j = i; j < count && particles[j]!.cloudIndex === lastCloudIndex; j++) {
        const q = particles[j]!;
        ex = Math.max(ex, Math.abs(q.offsetX) + q.scaleX * 0.5);
        ey = Math.max(ey, Math.abs(q.offsetY) + q.scaleY * 0.5);
        ez = Math.max(ez, Math.abs(q.offsetZ) + q.scaleZ * 0.5);
      }
      extentX = ex;
      extentY = ey;
      extentZ = ez;
      if (settings.terrainInteractionEnabled && getWorldY) {
        clusterTerrainY = getWorldY(wx, wz);
      }
      // Shared condensation Y = ~P25 of THIS bank's puff centers (local), not local 0 /
      // min bottoms. Plane at clusterY only shaved under-hang slivers; stacked soft U-ribs
      // sit above that and survived hard Discard. Raise into the mass underside.
      // Never per-puff equator (that staggered planes / ribs).
      if (!_deckCenterScratch || _deckCenterScratch.length < count) {
        _deckCenterScratch = new Float32Array(Math.max(count, 1));
      }
      let deckN = 0;
      for (let j = i; j < count && particles[j]!.cloudIndex === lastCloudIndex; j++) {
        const q = particles[j]!;
        if (!genusUsesCondensationClip(q.genus)) continue;
        _deckCenterScratch[deckN++] = q.offsetY;
      }
      bankLocalDeckY = deckN > 0 ? deckCenterPercentile(_deckCenterScratch, deckN, 0.25) : 0;
      let bankBaseY = p.clusterY;
      if (settings.terrainInteractionEnabled && getWorldY) {
        const layerLift = settings.layers[p.layer]?.terrainLift ?? true;
        if (layerLift) {
          const minBase = clusterTerrainY + clearance;
          if (bankBaseY < minBase) bankBaseY = minBase;
        }
      }
      // Profile deckPlaneYBiasM shifts the shared condensation plane through the mass
      // (designer + play). Cirrus / clip-off: bias ignored. Defaults are 0 for cumulus/stratus.
      const deckBiasM = genusUsesCondensationClip(p.genus)
        ? getCloudGenusProfile(p.genus).deckPlaneYBiasM
        : 0;
      bankDeckY = bankBaseY + bankLocalDeckY + deckBiasM;
    }

    if (settings.terrainInteractionEnabled && getWorldY) {
      if (p.layer !== lastLiftLayer) {
        lastLiftLayer = p.layer;
        layerAllowsLift = settings.layers[p.layer]?.terrainLift ?? true;
      }
      if (layerAllowsLift) {
        const minY = clusterTerrainY + clearance;
        if (worldY < minY) worldY = minY;
      }
    }

    const clipOn = genusUsesCondensationClip(p.genus) ? 1 : 0;
    // Cull puffs whose mass sits almost entirely below the raised bank deck (optional hang kill).
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
      underDeck ? 0 : 1,
    );
    writeCloudDeckClip(deckArray, i, bankDeckY, clipOn);

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
  }
  updateCloudBoundingSphere(mesh, boundMinX, boundMinY, boundMinZ, boundMaxX, boundMaxY, boundMaxZ);
}
