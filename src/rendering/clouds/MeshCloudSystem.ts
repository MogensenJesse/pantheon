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

function applyWindToInstances(
  mesh: InstancedMesh,
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
  getWorldY: ((x: number, z: number) => number) | null,
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
  // Keep more N·L contrast at golden hour so the sun-facing side reads clearly.
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
  // Opaque shared depth material — soft-alpha / view-facing mask cutouts discard in the
  // shadow pass (FrontSide→BackSide) and produce no umbra; PCF softens the silhouette.
  if (castShadows) {
    configureMeshShadowCast(mesh);
  } else {
    unregisterMeshShadowCast(mesh);
  }
}

function disposeCloudMeshGeometry(mesh: InstancedMesh): void {
  unregisterMeshShadowCast(mesh);
  mesh.geometry.dispose();
}

function disposeCloudMesh(mesh: InstancedMesh | null): void {
  if (!mesh) return;
  disposeCloudMeshGeometry(mesh);
  // Color material is owned by initMeshCloudSystem (shared across rebuilds).
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
  const geometry = createCloudSphereGeometry();

  let particles = field.particles;
  let mesh: InstancedMesh | null = new InstancedMesh(geometry, material, field.instanceCount);
  configureCloudMesh(mesh, settings.castShadows, settings.receiveShadows);
  applyWindToInstances(mesh, particles, 0, settings, null);

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

    if (mesh) {
      root.remove(mesh);
      disposeCloudMeshGeometry(mesh);
      mesh = null;
    }

    if (nextField.instanceCount === 0) {
      particles = [];
      root.visible = false;
      return;
    }

    const nextGeometry = createCloudSphereGeometry();
    mesh = new InstancedMesh(nextGeometry, material, nextField.instanceCount);
    configureCloudMesh(mesh, live.castShadows, live.receiveShadows);
    particles = nextField.particles;
    applyWindToInstances(mesh, particles, lastElapsed, live, getWorldY);
    root.add(mesh);
    root.visible = live.enabled;
    syncCloudMeshTerrainUniforms(uniforms, live);
    syncCloudLighting(sun, uniforms, lastVisibility);
  };

  return {
    root,
    update: ({
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
      applyWindToInstances(mesh, particles, elapsed, live, getWorldY);
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
      if (mesh) {
        root.remove(mesh);
        disposeCloudMesh(mesh);
        mesh = null;
      }
      material.dispose();
    },
  };
}
