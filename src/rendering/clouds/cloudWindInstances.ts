// src/rendering/clouds/cloudWindInstances.ts — wind drift, terrain lift, instance TRS for mesh clouds
import type { InstancedMesh, PerspectiveCamera } from 'three';
import type { CloudSettings } from './cloudConfig';
import { ensureCloudSortBuffers, packCloudInstancesWithOptionalSort } from './cloudInstanceSort';
import type { CloudParticlePlacement } from './generateCloudField';

/** World-units drift per second at windSpeed = 1. */
const WIND_TRAVEL_SCALE = 0.1;
/** Subtle oscillation amplitude (m) along wind axis. */
const WIND_SWAY_AMP = 5;
const WIND_SWAY_FREQ = 0.01;

/** Extra margin on frustum sphere for particle offsets / terrain lift. */
const CLOUD_BOUNDS_MARGIN_M = 60;

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

/** Frustum sphere covering wind-wrap XZ box + altitude band (corner diagonal + margin). */
function updateCloudBoundingSphere(mesh: InstancedMesh, settings: CloudSettings): void {
  if (!mesh.boundingSphere) {
    mesh.computeBoundingSphere();
  }
  const sphere = mesh.boundingSphere;
  if (!sphere) return;
  const half = settings.spread * 0.5;
  const yCenter = settings.cloudBaseY + settings.altitudeJitter * 0.5;
  const yExtent = settings.altitudeJitter * 0.5 + CLOUD_BOUNDS_MARGIN_M;
  sphere.center.set(0, yCenter, 0);
  sphere.radius = Math.sqrt(half * half + half * half + yExtent * yExtent) + CLOUD_BOUNDS_MARGIN_M;
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
  const lift = settings.terrainInteractionEnabled && getWorldY !== null;
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

    if (lift && getWorldY) {
      if (p.cloudIndex !== lastCloudIndex) {
        lastCloudIndex = p.cloudIndex;
        clusterTerrainY = getWorldY(wx, wz);
      }
      const minY = clusterTerrainY + clearance;
      if (worldY < minY) worldY = minY;
    }

    writeInstanceMatrix(array, i, worldX, worldY, worldZ, p.scaleX, p.scaleY, p.scaleZ, dirX, dirZ);
  }

  if (useSortPath) {
    packCloudInstancesWithOptionalSort(mesh, count, camera!);
  } else {
    mesh.instanceMatrix.needsUpdate = true;
  }
  updateCloudBoundingSphere(mesh, settings);
}
