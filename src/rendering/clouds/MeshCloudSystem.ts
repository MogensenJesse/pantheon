// src/rendering/clouds/MeshCloudSystem.ts — instanced soft-sphere mesh-cluster clouds
import {
  type DataTexture,
  type DirectionalLight,
  Group,
  InstancedMesh,
  Object3D,
  type PerspectiveCamera,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { enableWaterReflectionLayer } from '../../world/water/waterReflectionLayers';
import { goldenHourT } from '../postfx/postfxCohesion';
import { configureMeshShadowCast, unregisterMeshShadowCast } from '../sunShadow';
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
import { type CloudParticlePlacement, generateCloudField } from './generateCloudField';

const _sunDir = new Vector3();
const _instanceDummy = new Object3D();
const _camPos = new Vector3();

/** Scratch for back-to-front sort (reused; sized on demand). */
let _sortKeys: Float32Array | null = null;
let _sortOrder: Uint32Array | null = null;
let _sortedMatrices: Float32Array | null = null;

/** World-units drift per second at windSpeed = 1. */
const WIND_TRAVEL_SCALE = 0.1;
/** Subtle oscillation amplitude (m) along wind axis. */
const WIND_SWAY_AMP = 5;
const WIND_SWAY_FREQ = 0.01;

/** Soft-sphere tessellation — modest bump over 12×8 for smoother silhouettes. */
const CLOUD_SPHERE_WIDTH_SEGMENTS = 16;
const CLOUD_SPHERE_HEIGHT_SEGMENTS = 12;

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

function ensureSortBuffers(count: number): void {
  if (_sortKeys && _sortKeys.length >= count) return;
  _sortKeys = new Float32Array(count);
  _sortOrder = new Uint32Array(count);
  _sortedMatrices = new Float32Array(count * 16);
}

/**
 * Painter's algorithm within the InstancedMesh draw: farthest instances first so
 * nearer soft puffs composite over them (no depthWrite banding).
 */
function sortInstancesBackToFront(mesh: InstancedMesh, camX: number, camY: number, camZ: number): void {
  const count = mesh.count;
  if (count <= 1) return;
  ensureSortBuffers(count);
  const keys = _sortKeys!;
  const order = _sortOrder!;
  const sorted = _sortedMatrices!;
  const src = mesh.instanceMatrix.array as Float32Array;

  for (let i = 0; i < count; i++) {
    const o = i * 16;
    const dx = src[o + 12]! - camX;
    const dy = src[o + 13]! - camY;
    const dz = src[o + 14]! - camZ;
    keys[i] = dx * dx + dy * dy + dz * dz;
    order[i] = i;
  }

  order.sort((a, b) => keys[b]! - keys[a]!);

  for (let i = 0; i < count; i++) {
    const from = order[i]! * 16;
    sorted.set(src.subarray(from, from + 16), i * 16);
  }
  src.set(sorted.subarray(0, count * 16));
  mesh.instanceMatrix.needsUpdate = true;
}

function applyWindToInstances(
  mesh: InstancedMesh,
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
  getWorldY: ((x: number, z: number) => number) | null,
  camera: PerspectiveCamera | null,
): void {
  const rad = (settings.windDirectionDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = Math.cos(rad);
  const travel = elapsed * settings.windSpeed * WIND_TRAVEL_SCALE;
  const sway = Math.sin(elapsed * settings.windSpeed * WIND_SWAY_FREQ) * WIND_SWAY_AMP;
  const lift = settings.terrainInteractionEnabled && getWorldY !== null;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!;
    const wx = wrapAxis(p.clusterX + dirX * travel + dirX * sway, settings.spread);
    const wz = wrapAxis(p.clusterZ + dirZ * travel + dirZ * sway, settings.spread);
    const worldX = wx + p.offsetX;
    const worldZ = wz + p.offsetZ;
    let worldY = p.clusterY + p.offsetY;

    if (lift && getWorldY) {
      const terrainY = getWorldY(worldX, worldZ);
      const minY = terrainY + settings.terrainClearanceM;
      if (worldY < minY) worldY = minY;
    }

    _instanceDummy.position.set(worldX, worldY, worldZ);
    _instanceDummy.scale.set(p.scaleX, p.scaleY, p.scaleZ);
    _instanceDummy.rotation.set(0, 0, 0);
    _instanceDummy.updateMatrix();
    mesh.setMatrixAt(i, _instanceDummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  if (camera) {
    camera.getWorldPosition(_camPos);
    sortInstancesBackToFront(mesh, _camPos.x, _camPos.y, _camPos.z);
  }
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
  mesh.frustumCulled = false;
  mesh.castShadow = castShadows;
  mesh.receiveShadow = receiveShadows;
  mesh.renderOrder = CLOUD_MESH_RENDER_ORDER;
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
  let mesh: InstancedMesh | null = new InstancedMesh(
    createCloudSphereGeometry(),
    material,
    field.instanceCount,
  );
  configureCloudMesh(mesh, settings.castShadows, settings.receiveShadows);
  applyWindToInstances(mesh, particles, 0, settings, null, null);

  root.add(mesh);
  scene.add(root);
  enableWaterReflectionLayer(root);
  syncCloudLighting(sun, uniforms, initialVisibility);

  let lastElapsed = 0;
  let lastVisibility = initialVisibility;
  let getWorldY: ((x: number, z: number) => number) | null = null;

  const rebuild = () => {
    const live = getLiveCloudSettings();
    const nextField = generateCloudField({ settings: live });

    disposeCloudMesh(root, mesh);
    mesh = null;

    if (nextField.instanceCount === 0) {
      particles = [];
      root.visible = false;
      return;
    }

    mesh = new InstancedMesh(createCloudSphereGeometry(), material, nextField.instanceCount);
    configureCloudMesh(mesh, live.castShadows, live.receiveShadows);
    particles = nextField.particles;
    applyWindToInstances(mesh, particles, lastElapsed, live, getWorldY, null);
    root.add(mesh);
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
      configureCloudMesh(mesh, live.castShadows, live.receiveShadows);
      applyWindToInstances(mesh, particles, elapsed, live, getWorldY, camera);
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
      disposeCloudMesh(root, mesh);
      mesh = null;
      material.dispose();
    },
  };
}
