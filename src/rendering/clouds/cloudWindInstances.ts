// src/rendering/clouds/cloudWindInstances.ts — wind drift, terrain lift, instance TRS for mesh clouds
import { Sphere, type InstancedMesh, type PerspectiveCamera } from 'three';
import type { CloudSettings } from './cloudConfig';
import { ensureCloudSortBuffers, packCloudInstancesWithOptionalSort } from './cloudInstanceSort';
import type { CloudParticlePlacement } from './generateCloudField';

/** World-units drift per second at windSpeed = 1. */
const WIND_TRAVEL_SCALE = 0.1;
/** Subtle oscillation amplitude (m) along wind axis. */
const WIND_SWAY_AMP = 5;
const WIND_SWAY_FREQ = 0.01;

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

  // Particles are authored contiguously per cluster — sample terrain once per cluster.
  let lastCloudIndex = -1;
  let clusterTerrainY = 0;
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

    if (settings.terrainInteractionEnabled && getWorldY) {
      if (p.layer !== lastLiftLayer) {
        lastLiftLayer = p.layer;
        layerAllowsLift = settings.layers[p.layer]?.terrainLift ?? true;
      }
      if (layerAllowsLift) {
        if (p.cloudIndex !== lastCloudIndex) {
          lastCloudIndex = p.cloudIndex;
          clusterTerrainY = getWorldY(wx, wz);
        }
        const minY = clusterTerrainY + clearance;
        if (worldY < minY) worldY = minY;
      }
    }

    writeInstanceMatrix(array, i, worldX, worldY, worldZ, p.scaleX, p.scaleY, p.scaleZ, dirX, dirZ);

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
  }
  updateCloudBoundingSphere(mesh, boundMinX, boundMinY, boundMinZ, boundMaxX, boundMaxY, boundMaxZ);
}
