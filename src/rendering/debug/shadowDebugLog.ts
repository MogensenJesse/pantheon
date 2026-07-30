// src/rendering/debug/shadowDebugLog.ts — DEV diagnostics for sun shadow maps + terrain shadow(sun)
import {
  type DirectionalLight,
  type InstancedMesh,
  type Mesh,
  type Object3D,
  type Scene,
  Vector3,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import type { TerrainSplatMaterial } from '../../world/terrain';
import {
  getNearCascadeShadowLight,
  readContactShadowSoftness,
  type SunShadowDebugTargets,
  type SunShadowReceiverProfile,
  setShadowFloor,
} from '../sunShadow';

let lastSunIntensity = -1;
const _shadowRight = new Vector3();
const _shadowUp = new Vector3();
const _shadowTarget = new Vector3();

export interface ShadowDebugInput {
  renderer: WebGPURenderer;
  scene: Scene;
  sun: DirectionalLight;
  terrainMaterial: TerrainSplatMaterial;
  terrainReceiveShadow: boolean;
  terrainCastShadow: boolean;
  mapPropMeshes: InstancedMesh[];
  disableShadowsDev: boolean;
  sunShadowDebugTargets?: SunShadowDebugTargets;
  energy: number;
  energyCap: number;
}

interface ShadowCasterCounts {
  meshesInScene: number;
  castShadowMeshes: number;
  instancedCastShadow: number;
  visibleCastShadow: number;
  mapPropGroups: number;
  mapPropCastShadowGroups: number;
  mapPropReceiveShadowGroups: number;
}

function countShadowCasters(scene: Scene, mapPropMeshes: InstancedMesh[]): ShadowCasterCounts {
  let meshesInScene = 0;
  let castShadowMeshes = 0;
  let instancedCastShadow = 0;
  let visibleCastShadow = 0;

  scene.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    meshesInScene++;
    if (!mesh.castShadow) return;
    castShadowMeshes++;
    if (mesh.visible) visibleCastShadow++;
    if ((mesh as InstancedMesh).isInstancedMesh) instancedCastShadow++;
  });

  let mapPropCastShadowGroups = 0;
  let mapPropReceiveShadowGroups = 0;
  for (const mesh of mapPropMeshes) {
    if (mesh.castShadow) mapPropCastShadowGroups++;
    if (mesh.receiveShadow) mapPropReceiveShadowGroups++;
  }

  return {
    meshesInScene,
    castShadowMeshes,
    instancedCastShadow,
    visibleCastShadow,
    mapPropGroups: mapPropMeshes.length,
    mapPropCastShadowGroups,
    mapPropReceiveShadowGroups,
  };
}

function terrainShadowHints(material: TerrainSplatMaterial): Record<string, unknown> {
  const mat = material as TerrainSplatMaterial & {
    isNodeMaterial?: boolean;
    lights?: boolean;
    colorNode?: unknown;
    receivedShadowPositionNode?: unknown;
    terrainUniforms?: { uSunIntensity?: { value: number } };
  };
  return {
    isNodeMaterial: mat.isNodeMaterial === true,
    lights: mat.lights,
    hasColorNode: mat.colorNode != null,
    hasReceivedShadowPositionNode: mat.receivedShadowPositionNode != null,
    uSunIntensity: mat.terrainUniforms?.uSunIntensity?.value,
  };
}

function diagnose(input: ShadowDebugInput, counts: ShadowCasterCounts): string[] {
  const { renderer, sun, disableShadowsDev } = input;
  const issues: string[] = [];

  if (!renderer.shadowMap.enabled) {
    issues.push('renderer.shadowMap.enabled is false — no shadow maps will render');
  }
  if (disableShadowsDev) {
    issues.push(
      'dev panel "Disable shadows" is ON — sun.shadow.intensity=0, terrain uShadowFloor=1 (map kept for god rays)',
    );
  }
  if (sun.intensity <= 0.02) {
    issues.push(
      `sun.intensity=${sun.intensity.toFixed(3)} — no direct sun on terrain until reveal`,
    );
  }
  if (!sun.castShadow) {
    issues.push('sun.castShadow is false — shadow pass skipped');
  }
  if (!sun.shadow.map) {
    issues.push(
      'sun.shadow.map is null — ShadowNode may not have run yet (terrain must render with shadow() active)',
    );
  }
  if (counts.castShadowMeshes === 0) {
    issues.push('no scene meshes have castShadow=true — nothing to draw into shadow map');
  }
  if (counts.mapPropCastShadowGroups === 0) {
    issues.push('no map prop InstancedMesh groups have castShadow (trees/rocks/foliage?)');
  }
  if (!input.terrainCastShadow && sun.intensity > 0.02) {
    issues.push('terrain mesh castShadow=false — hills will not cast shadows');
  }

  return issues;
}

/**
 * Logs shadow pipeline state. Throttled unless `force` is true.
 * In DEV, also exposes `window.__logShadowDebug()` for manual dumps.
 */
export function logShadowDebug(input: ShadowDebugInput, force = false): void {
  if (!import.meta.env.DEV) return;

  const sunIntensity = input.sun.intensity;
  const sunCrossedOn = lastSunIntensity <= 0.02 && sunIntensity > 0.02;
  lastSunIntensity = sunIntensity;

  // Only log on explicit triggers (manual call or sun just turning on). The
  // periodic interval log was too noisy to filter against renderDebug.
  if (!force && !sunCrossedOn) return;

  const { sun } = input;
  const shadow = sun.shadow;
  const counts = countShadowCasters(input.scene, input.mapPropMeshes);
  const issues = diagnose(input, counts);
  const cam = shadow.camera;
  const trigger = force ? 'manual' : 'sun-just-on';
  const texelW = (cam.right - cam.left) / shadow.mapSize.x;
  const texelH = (cam.top - cam.bottom) / shadow.mapSize.y;
  _shadowRight.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
  _shadowUp.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
  sun.target.getWorldPosition(_shadowTarget);

  const nearLight = getNearCascadeShadowLight();
  const nearShadow = nearLight?.shadow;
  const nearCam = nearShadow?.camera;
  const nearCfg = VISUAL.shadows.lighting.near;
  const nearTexelM =
    nearCam && nearShadow
      ? `${((nearCam.right - nearCam.left) / nearShadow.mapSize.x).toFixed(4)}x${(
          (nearCam.top - nearCam.bottom) / nearShadow.mapSize.y
        ).toFixed(4)}`
      : null;

  const flat = {
    trigger,
    energy: `${input.energy}/${input.energyCap}`,
    sunI: +sun.intensity.toFixed(3),
    sunCastShadow: sun.castShadow,
    shadowMapEnabled: input.renderer.shadowMap.enabled,
    disableShadowsDev: input.disableShadowsDev,
    hasMap: shadow.map !== null,
    mapSize: shadow.map ? `${shadow.mapSize.width}x${shadow.mapSize.height}` : null,
    needsUpdate: shadow.needsUpdate,
    autoUpdate: shadow.autoUpdate,
    bias: shadow.bias,
    normalBias: shadow.normalBias,
    shadowIntensity: shadow.intensity,
    shadowTexelM: `${texelW.toFixed(4)}x${texelH.toFixed(4)}`,
    nearEnabled: nearCfg.enabled,
    nearHasMap: nearShadow?.map != null,
    nearMapSize: nearShadow?.map
      ? `${nearShadow.mapSize.width}x${nearShadow.mapSize.height}`
      : null,
    nearHalfExtentM: nearCfg.halfExtentM,
    nearTexelM,
    snappedLightXY: `${_shadowTarget.dot(_shadowRight).toFixed(4)},${_shadowTarget
      .dot(_shadowUp)
      .toFixed(4)}`,
    castShadowMeshes: counts.castShadowMeshes,
    visibleCastShadow: counts.visibleCastShadow,
    instancedCastShadow: counts.instancedCastShadow,
    mapPropCastShadowGroups: counts.mapPropCastShadowGroups,
    mapPropReceiveShadowGroups: counts.mapPropReceiveShadowGroups,
    mapPropGroups: counts.mapPropGroups,
    propShadowFloor: input.sunShadowDebugTargets?.props?.value,
    waterShadowFloor: input.sunShadowDebugTargets?.water?.value,
    terrainReceiveShadow: input.terrainReceiveShadow,
    terrainCastShadow: input.terrainCastShadow,
    shadowRadius: shadow.radius,
    usePcss: VISUAL.shadows.lighting.usePcss,
    pcssVogelSeed: VISUAL.shadows.lighting.pcssVogelSeed,
    pcssRadiusMode: VISUAL.shadows.lighting.pcssRadiusMode,
    contactSoftMin: readContactShadowSoftness().softnessMin,
    contactSoftMax: readContactShadowSoftness().softnessMax,
    contactPenumbraScale: readContactShadowSoftness().penumbraScale,
    issuesCount: issues.length,
  };

  console.info('[ShadowDebug]', flat);
  if (issues.length > 0) {
    console.warn('[ShadowDebug] diagnosis:', issues);
  }
  console.debug('[ShadowDebug] details', {
    shadowCamera: {
      near: cam.near,
      far: cam.far,
      left: cam.left,
      right: cam.right,
      top: cam.top,
      bottom: cam.bottom,
    },
    sunPos: sun.position.toArray().map((n) => +n.toFixed(2)),
    sunTarget: sun.target.position.toArray().map((n) => +n.toFixed(2)),
    terrain: terrainShadowHints(input.terrainMaterial),
  });
}

export function logShadowDebugInit(input: ShadowDebugInput): void {
  if (!import.meta.env.DEV) return;

  const w = window as Window & {
    __logShadowDebug?: () => void;
    __shadowView?: (on: boolean) => void;
    __shadowFloor?: (profile: SunShadowReceiverProfile, value: number) => void;
    __terrainShadowFloor?: (v: number) => void;
    __grassShadowFloor?: (v: number) => void;
    __propShadowFloor?: (v: number) => void;
    __waterShadowFloor?: (v: number) => void;
  };
  w.__logShadowDebug = () => logShadowDebug(input, true);
  w.__shadowView = (on: boolean) => {
    const u = input.terrainMaterial.terrainUniforms;
    if (!u.uDebugShadowView) {
      console.warn('[ShadowDebug] terrain has no uDebugShadowView uniform');
      return;
    }
    u.uDebugShadowView.value = on ? 1 : 0;
    console.info(`[ShadowDebug] shadow visualization ${on ? 'ON' : 'OFF'}`);
  };
  w.__shadowFloor = (profile: SunShadowReceiverProfile, value: number) => {
    if (!input.sunShadowDebugTargets) {
      console.warn('[ShadowDebug] no sun shadow debug targets');
      return;
    }
    if (!setShadowFloor(input.sunShadowDebugTargets, profile, value)) {
      console.warn(`[ShadowDebug] no shadow floor for profile "${profile}"`);
      return;
    }
    console.info(`[ShadowDebug] ${profile} shadow floor = ${value} (0 = black, 1 = no darkening)`);
  };
  w.__terrainShadowFloor = (v: number) => w.__shadowFloor?.('terrain', v);
  w.__grassShadowFloor = (v: number) => w.__shadowFloor?.('grass', v);
  w.__propShadowFloor = (v: number) => w.__shadowFloor?.('props', v);
  w.__waterShadowFloor = (v: number) => w.__shadowFloor?.('water', v);
}

export function disposeShadowDebug(): void {
  const w = window as Window & {
    __logShadowDebug?: () => void;
    __shadowView?: (on: boolean) => void;
    __shadowFloor?: (profile: SunShadowReceiverProfile, value: number) => void;
    __terrainShadowFloor?: (v: number) => void;
    __grassShadowFloor?: (v: number) => void;
    __propShadowFloor?: (v: number) => void;
    __waterShadowFloor?: (v: number) => void;
  };
  delete w.__logShadowDebug;
  delete w.__shadowView;
  delete w.__shadowFloor;
  delete w.__terrainShadowFloor;
  delete w.__grassShadowFloor;
  delete w.__propShadowFloor;
  delete w.__waterShadowFloor;
}
