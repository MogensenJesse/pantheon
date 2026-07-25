// src/rendering/clouds/MeshCloudSystem.ts — instanced soft-sphere mesh-cluster clouds
import {
  type DataTexture,
  type DirectionalLight,
  Group,
  InstancedMesh,
  type PerspectiveCamera,
  type Scene,
  Vector3,
} from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  disableWaterReflectionLayer,
  enableWaterReflectionLayer,
  enableWaterReflectionOnlyLayer,
} from '../layers/waterReflectionLayers';
import { goldenHourT } from '../postfx/postfxCohesion';
import { invalidateCloudCastShadowMap } from '../sunShadow';
import { type CloudVisibilityParams, sampleCloudLit } from './cloudColorTsl';
import type { CloudSettings } from './cloudConfig';
import { readCloudSettings } from './cloudConfig';
import { getLiveCloudSettings } from './cloudDevState';
import {
  buildClusterProxyPlacements,
  configureCloudMesh,
  createCloudProxySphereGeometry,
  createCloudSphereGeometry,
  disposeCloudMesh,
  readReflectCloudsMode,
} from './cloudMeshLifecycle';
import {
  bindCloudMeshHeightTexture,
  CLOUD_MESH_RENDER_ORDER,
  type CloudMeshUniforms,
  createCloudMeshMaterial,
  createCloudMeshUniforms,
  syncCloudMeshLighting,
  syncCloudMeshTerrainUniforms,
} from './cloudMeshMaterial';
import { applyWindToCloudInstances } from './cloudWindInstances';
import {
  type CloudFieldData,
  type CloudParticlePlacement,
  generateCloudField,
} from './generateCloudField';

const _sunDir = new Vector3();

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
  applyWindToCloudInstances(mesh, particles, 0, settings, null, null);

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
    applyWindToCloudInstances(proxyMesh, proxyParticles, elapsed, live, getWorldY, null);
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
    applyWindToCloudInstances(mesh, particles, lastElapsed, live, getWorldY, null);
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

      applyWindToCloudInstances(mesh, particles, elapsed, live, getWorldY, camera);
      if (proxyMesh && proxyParticles.length > 0) {
        // No painter sort — low-res reflector; cluster count is small.
        applyWindToCloudInstances(proxyMesh, proxyParticles, elapsed, live, getWorldY, null);
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
