// src/rendering/clouds/MeshCloudSystem.ts — instanced soft-sphere mesh-cluster clouds
import {
  Color,
  type DirectionalLight,
  Group,
  InstancedMesh,
  type Material,
  Object3D,
  type PerspectiveCamera,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { enableWaterReflectionLayer } from '../../world/water/waterReflectionLayers';
import type { CloudSettings } from './cloudConfig';
import { readCloudSettings } from './cloudConfig';
import { getLiveCloudSettings } from './cloudDevState';
import {
  computeCloudOpacity,
  sampleCloudColors,
  type CloudVisibilityParams,
} from './cloudColorTsl';
import {
  CLOUD_MESH_RENDER_ORDER,
  createCloudMeshMaterial,
  createCloudMeshUniforms,
  syncCloudMeshLighting,
  type CloudMeshUniforms,
} from './cloudMeshMaterial';
import { generateCloudField, type CloudParticlePlacement } from './generateCloudField';

const _sunDir = new Vector3();
const _instanceDummy = new Object3D();
const _colorScratch = {
  sunColor: new Color(),
  ambientColor: new Color(),
  cloudTint: new Color(),
};

/** World-units drift per second at windSpeed = 1. */
const WIND_TRAVEL_SCALE = 0.1;
/** Subtle oscillation amplitude (m) along wind axis. */
const WIND_SWAY_AMP = 5;
const WIND_SWAY_FREQ = 0.01;

export interface MeshCloudUpdateParams {
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  elapsed: number;
  elevationDeg: number;
  daylightFactor: number;
  hdriWeight: number;
  atmosphereBlendT: number;
}

export interface MeshCloudSystemContext {
  root: Group;
  update: (params: MeshCloudUpdateParams) => void;
  rebuild: () => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

function wrapAxis(value: number, spread: number): number {
  const half = spread * 0.5;
  let v = value;
  while (v > half) v -= spread;
  while (v < -half) v += spread;
  return v;
}

function applyWindToInstances(
  mesh: InstancedMesh,
  particles: CloudParticlePlacement[],
  elapsed: number,
  settings: CloudSettings,
): void {
  const rad = (settings.windDirectionDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = Math.cos(rad);
  const travel = elapsed * settings.windSpeed * WIND_TRAVEL_SCALE;
  const sway = Math.sin(elapsed * settings.windSpeed * WIND_SWAY_FREQ) * WIND_SWAY_AMP;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!;
    const wx = wrapAxis(p.clusterX + dirX * travel + dirX * sway, settings.spread);
    const wz = wrapAxis(p.clusterZ + dirZ * travel + dirZ * sway, settings.spread);
    _instanceDummy.position.set(wx + p.offsetX, p.clusterY + p.offsetY, wz + p.offsetZ);
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
  const colors = sampleCloudColors(visibility.elevationDeg, _colorScratch);
  syncCloudMeshLighting(uniforms, {
    sunDir: _sunDir,
    sunColor: colors.sunColor,
    ambientColor: colors.ambientColor,
    baseColor: colors.cloudTint,
    opacity: computeCloudOpacity(visibility),
  });
}

function configureCloudMesh(mesh: InstancedMesh): void {
  mesh.name = 'meshCloudInstances';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = CLOUD_MESH_RENDER_ORDER;
}

function disposeCloudMesh(mesh: InstancedMesh | null): void {
  if (!mesh) return;
  mesh.geometry.dispose();
  (mesh.material as Material).dispose();
}

/** Scene-layer procedural clouds — replaces SkyMesh dome clouds once gated in skyRevealBlend. */
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

  const uniforms = createCloudMeshUniforms();
  const material = createCloudMeshMaterial(uniforms);
  const geometry = new SphereGeometry(1, 12, 8);

  let particles = field.particles;
  let mesh: InstancedMesh | null = new InstancedMesh(geometry, material, field.instanceCount);
  configureCloudMesh(mesh);
  applyWindToInstances(mesh, particles, 0, settings);

  root.add(mesh);
  scene.add(root);
  enableWaterReflectionLayer(root);
  syncCloudLighting(sun, uniforms, initialVisibility);

  let lastElapsed = 0;
  let lastVisibility = initialVisibility;

  const rebuild = () => {
    const live = getLiveCloudSettings();
    const nextField = generateCloudField({ settings: live });

    if (mesh) {
      root.remove(mesh);
      disposeCloudMesh(mesh);
      mesh = null;
    }

    if (nextField.instanceCount === 0) {
      particles = [];
      root.visible = false;
      return;
    }

    const nextGeometry = new SphereGeometry(1, 12, 8);
    mesh = new InstancedMesh(nextGeometry, material, nextField.instanceCount);
    configureCloudMesh(mesh);
    particles = nextField.particles;
    applyWindToInstances(mesh, particles, lastElapsed, live);
    root.add(mesh);
    root.visible = live.enabled;
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
      root.position.copy(camera.position);
      const live = getLiveCloudSettings();
      root.visible = live.enabled;
      if (!mesh || particles.length === 0) return;
      applyWindToInstances(mesh, particles, elapsed, live);
      syncCloudLighting(light, uniforms, lastVisibility);
    },
    rebuild,
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
    },
  };
}
