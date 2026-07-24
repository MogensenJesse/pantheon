// src/rendering/clouds/MeshCloudSystem.ts — instanced soft-sphere mesh-cluster clouds
import {
  type DataTexture,
  type DirectionalLight,
  Group,
  InstancedMesh,
  type PerspectiveCamera,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  disableWaterReflectionLayer,
  enableWaterReflectionLayer,
  enableWaterReflectionOnlyLayer,
} from '../layers/waterReflectionLayers';
import { goldenHourT } from '../postfx/postfxCohesion';
import {
  configureMeshShadowCast,
  invalidateCloudCastShadowMap,
  unregisterMeshShadowCast,
} from '../sunShadow';
import { CLOUD_SHADOW_LAYER } from '../sunShadow/cloudCastShadowLayer';
import { type CloudVisibilityParams, sampleCloudLit } from './cloudColorTsl';
import type { CloudSettings } from './cloudConfig';
import { readCloudSettings } from './cloudConfig';
import { getLiveCloudSettings } from './cloudDevState';
import {
  bindCloudMeshHeightTexture,
  CLOUD_MESH_RENDER_ORDER,
  type CloudMeshUniforms,
  createCloudMeshMaterial,
  createCloudMeshUniforms,
  syncCloudMeshLighting,
  syncCloudMeshTerrainUniforms,
} from './cloudMeshMaterial';
import {
  type CloudFieldData,
  type CloudParticlePlacement,
  generateCloudField,
} from './generateCloudField';

const _sunDir = new Vector3();
const _camPos = new Vector3();

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

/** World-units drift per second at windSpeed = 1. */
const WIND_TRAVEL_SCALE = 0.1;
/** Subtle oscillation amplitude (m) along wind axis. */
const WIND_SWAY_AMP = 5;
const WIND_SWAY_FREQ = 0.01;

/** Soft-sphere tessellation — soft N·V hides faceting; keep low for fill rate. */
const CLOUD_SPHERE_WIDTH_SEGMENTS = 10;
const CLOUD_SPHERE_HEIGHT_SEGMENTS = 8;

/** Reflection proxy spheres — low-res RT; faceting is invisible. */
const CLOUD_PROXY_WIDTH_SEGMENTS = 6;
const CLOUD_PROXY_HEIGHT_SEGMENTS = 4;

/** Extra margin on frustum sphere for particle offsets / terrain lift. */
const CLOUD_BOUNDS_MARGIN_M = 60;

export interface MeshCloudUpdateParams {
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  elapsed: number;
  elevationDeg: number;
  daylightFactor: number;
  hdriWeight: number;
  atmosphereBlendT: number;
}

export interface CloudTerrainHeightBind {
  heightMap: DataTexture;
  worldSize: number;
  heightScale: number;
  getWorldY: (x: number, z: number) => number;
}

export interface MeshCloudSystemContext {
  root: Group;
  update: (params: MeshCloudUpdateParams) => void;
  rebuild: () => void;
  bindTerrainHeight: (bind: CloudTerrainHeightBind) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

/** Toroidal wrap in world XZ around the field origin (keeps clouds over the play area). */
function wrapAxis(value: number, spread: number): number {
  const half = spread * 0.5;
  let v = value;
  while (v > half) v -= spread;
  while (v < -half) v += spread;
  return v;
}

function createCloudSphereGeometry(): SphereGeometry {
  return new SphereGeometry(1, CLOUD_SPHERE_WIDTH_SEGMENTS, CLOUD_SPHERE_HEIGHT_SEGMENTS);
}

function createCloudProxySphereGeometry(): SphereGeometry {
  return new SphereGeometry(1, CLOUD_PROXY_WIDTH_SEGMENTS, CLOUD_PROXY_HEIGHT_SEGMENTS);
}

/**
 * One inflated sphere per cluster for the water reflector — covers soft-particle footprint
 * without redrawing particlesPerCloud soft spheres into the low-res RT.
 */
function buildClusterProxyPlacements(
  field: CloudFieldData,
  scaleMul: number,
): CloudParticlePlacement[] {
  const out: CloudParticlePlacement[] = [];
  for (const c of field.clusters) {
    let maxR = 1;
    for (const p of c.particles) {
      const reach = Math.hypot(p.x, p.y, p.z) + Math.max(p.sx, p.sy, p.sz) * 0.5;
      if (reach > maxR) maxR = reach;
    }
    const s = maxR * scaleMul;
    out.push({
      cloudIndex: c.index,
      particleIndex: 0,
      genus: c.genus,
      clusterX: c.centerX,
      clusterY: c.centerY,
      clusterZ: c.centerZ,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      scaleX: s,
      scaleY: s * 0.55,
      scaleZ: s * 0.85,
    });
  }
  return out;
}

function ensureSortBuffers(count: number): void {
  if (
    _sortKeys &&
    _sortKeys.length >= count &&
    _particleMatrices &&
    _particleMatrices.length >= count * 16
  ) {
    return;
  }
  _sortKeys = new Float32Array(count);
  _sortOrder = new Uint32Array(count);
  _particleMatrices = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) _sortOrder[i] = i;
  _sortOrderCount = count;
  _sortFrameCounter = 0;
  _lastSortCamX = Number.POSITIVE_INFINITY;
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
function packInstancesWithOptionalSort(
  mesh: InstancedMesh,
  count: number,
  camera: PerspectiveCamera,
): void {
  if (count <= 0) return;
  ensureSortBuffers(count);
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

function applyWindToInstances(
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
  if (useSortPath) ensureSortBuffers(count);
  const array = useSortPath ? _particleMatrices! : (mesh.instanceMatrix.array as Float32Array);

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
    packInstancesWithOptionalSort(mesh, count, camera!);
  } else {
    mesh.instanceMatrix.needsUpdate = true;
  }
  updateCloudBoundingSphere(mesh, settings);
}

function syncCloudLighting(
  sun: DirectionalLight,
  uniforms: CloudMeshUniforms,
  visibility: CloudVisibilityParams,
): void {
  _sunDir.copy(sun.position).sub(sun.target.position).normalize();
  const live = getLiveCloudSettings();
  const lit = sampleCloudLit(visibility, live);
  syncCloudMeshLighting(uniforms, {
    sunDir: _sunDir,
    sunColor: lit.colors.sunColor,
    ambientColor: lit.colors.ambientColor,
    baseColor: lit.colors.cloudTint,
    opacity: lit.opacity,
    lightScale: lit.lightScale,
    sunIntensity: sun.intensity,
  });
  const gh = goldenHourT(visibility.elevationDeg);
  uniforms.uLightFlatten.value = live.lightFlatten * (1 - gh * 0.55);
}

function configureCloudMesh(
  mesh: InstancedMesh,
  castShadows: boolean,
  receiveShadows: boolean,
): void {
  mesh.name = 'meshCloudInstances';
  mesh.frustumCulled = true;
  mesh.castShadow = castShadows;
  mesh.receiveShadow = receiveShadows;
  mesh.renderOrder = CLOUD_MESH_RENDER_ORDER;
  // Soft cloud-cast map only — leave layer 0 so the main PCSS sun map never sees clouds.
  mesh.layers.disable(0);
  mesh.layers.enable(CLOUD_SHADOW_LAYER);
  if (castShadows) {
    configureMeshShadowCast(mesh);
  } else {
    unregisterMeshShadowCast(mesh);
  }
}

function disposeCloudMesh(root: Group, mesh: InstancedMesh | null): void {
  if (!mesh) return;
  unregisterMeshShadowCast(mesh);
  root.remove(mesh);
  mesh.geometry.dispose();
}

function readReflectCloudsMode(): 'proxy' | 'full' | 'off' {
  return VISUAL.water.reflectClouds;
}

/** Scene-layer procedural clouds — world-fixed field with wind drift (not camera-parented). */
export function initMeshCloudSystem(
  scene: Scene,
  sun: DirectionalLight,
): MeshCloudSystemContext | null {
  const settings = readCloudSettings();
  if (!settings.enabled) return null;

  const field = generateCloudField({ settings });
  if (field.instanceCount === 0) return null;

  const initialVisibility: CloudVisibilityParams = {
    elevationDeg: -5,
    daylightFactor: 0,
    hdriWeight: 1,
    atmosphereBlendT: 0,
  };

  const root = new Group();
  root.name = 'meshClouds';
  root.frustumCulled = false;
  root.position.set(0, 0, 0);

  const uniforms = createCloudMeshUniforms();
  syncCloudMeshTerrainUniforms(uniforms, settings);
  const material = createCloudMeshMaterial(sun, uniforms);

  let particles = field.particles;
  let proxyParticles: CloudParticlePlacement[] = [];
  let mesh: InstancedMesh | null = new InstancedMesh(
    createCloudSphereGeometry(),
    material,
    field.instanceCount,
  );
  let proxyMesh: InstancedMesh | null = null;
  configureCloudMesh(mesh, settings.castShadows, settings.receiveShadows);
  applyWindToInstances(mesh, particles, 0, settings, null, null);

  root.add(mesh);
  scene.add(root);

  const applyReflectionLayers = (
    sourceField: CloudFieldData,
    live: CloudSettings,
    elapsed: number,
  ) => {
    if (!mesh) return;
    const mode = readReflectCloudsMode();
    disposeCloudMesh(root, proxyMesh);
    proxyMesh = null;
    proxyParticles = [];

    if (mode === 'full') {
      enableWaterReflectionLayer(mesh);
      return;
    }

    disableWaterReflectionLayer(mesh);
    if (mode === 'off' || sourceField.clusterCount === 0) return;

    proxyParticles = buildClusterProxyPlacements(sourceField, VISUAL.water.reflectCloudProxyScale);
    if (proxyParticles.length === 0) return;

    proxyMesh = new InstancedMesh(
      createCloudProxySphereGeometry(),
      material,
      proxyParticles.length,
    );
    proxyMesh.name = 'meshCloudReflectionProxy';
    proxyMesh.frustumCulled = true;
    proxyMesh.castShadow = false;
    proxyMesh.receiveShadow = false;
    proxyMesh.renderOrder = CLOUD_MESH_RENDER_ORDER;
    enableWaterReflectionOnlyLayer(proxyMesh);
    applyWindToInstances(proxyMesh, proxyParticles, elapsed, live, getWorldY, null);
    root.add(proxyMesh);
  };

  let lastElapsed = 0;
  let lastVisibility = initialVisibility;
  let getWorldY: ((x: number, z: number) => number) | null = null;
  let lastCastShadows = settings.castShadows;
  let lastReceiveShadows = settings.receiveShadows;

  applyReflectionLayers(field, settings, 0);
  syncCloudLighting(sun, uniforms, initialVisibility);

  const rebuild = () => {
    const live = getLiveCloudSettings();
    const nextField = generateCloudField({ settings: live });

    disposeCloudMesh(root, proxyMesh);
    proxyMesh = null;
    proxyParticles = [];
    disposeCloudMesh(root, mesh);
    mesh = null;

    if (nextField.instanceCount === 0) {
      particles = [];
      root.visible = false;
      return;
    }

    mesh = new InstancedMesh(createCloudSphereGeometry(), material, nextField.instanceCount);
    configureCloudMesh(mesh, live.castShadows, live.receiveShadows);
    // New cloud layout → new soft cloud-cast silhouettes.
    invalidateCloudCastShadowMap();
    lastCastShadows = live.castShadows;
    lastReceiveShadows = live.receiveShadows;
    particles = nextField.particles;
    applyWindToInstances(mesh, particles, lastElapsed, live, getWorldY, null);
    root.add(mesh);
    applyReflectionLayers(nextField, live, lastElapsed);
    root.visible = live.enabled;
    syncCloudMeshTerrainUniforms(uniforms, live);
    syncCloudLighting(sun, uniforms, lastVisibility);
  };

  return {
    root,
    update: ({
      camera,
      sun: light,
      elapsed,
      elevationDeg,
      daylightFactor,
      hdriWeight,
      atmosphereBlendT,
    }) => {
      lastElapsed = elapsed;
      lastVisibility = {
        elevationDeg,
        daylightFactor,
        hdriWeight,
        atmosphereBlendT,
      };
      const live = getLiveCloudSettings();
      root.visible = live.enabled;
      if (!mesh || particles.length === 0) return;

      if (live.castShadows !== lastCastShadows || live.receiveShadows !== lastReceiveShadows) {
        configureCloudMesh(mesh, live.castShadows, live.receiveShadows);
        if (live.castShadows !== lastCastShadows) {
          // Soft cloud-cast map content changed with no sun/target motion.
          invalidateCloudCastShadowMap();
        }
        lastCastShadows = live.castShadows;
        lastReceiveShadows = live.receiveShadows;
      }

      applyWindToInstances(mesh, particles, elapsed, live, getWorldY, camera);
      if (proxyMesh && proxyParticles.length > 0) {
        // No painter sort — low-res reflector; cluster count is small.
        applyWindToInstances(proxyMesh, proxyParticles, elapsed, live, getWorldY, null);
      }
      syncCloudMeshTerrainUniforms(uniforms, live);
      syncCloudLighting(light, uniforms, lastVisibility);
    },
    rebuild,
    bindTerrainHeight: (bind) => {
      bindCloudMeshHeightTexture(uniforms, bind.heightMap, bind.worldSize, bind.heightScale);
      getWorldY = bind.getWorldY;
      syncCloudMeshTerrainUniforms(uniforms, getLiveCloudSettings());
    },
    setEnabled: (enabled) => {
      root.visible = enabled;
    },
    dispose: () => {
      scene.remove(root);
      disposeCloudMesh(root, proxyMesh);
      proxyMesh = null;
      disposeCloudMesh(root, mesh);
      mesh = null;
      material.dispose();
    },
  };
}
