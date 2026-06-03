// src/rendering/debug/shadowDebugLog.ts — DEV diagnostics for sun shadow maps + terrain shadow(sun)
import type { DirectionalLight, InstancedMesh, Mesh, Object3D, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { TerrainSplatMaterial } from '../../world/terrain/TerrainSplatMaterial';

let lastSunIntensity = -1;

export interface ShadowDebugInput {
  renderer: WebGPURenderer;
  scene: Scene;
  sun: DirectionalLight;
  terrainMaterial: TerrainSplatMaterial;
  terrainReceiveShadow: boolean;
  mapPropMeshes: InstancedMesh[];
  disableShadowsDev: boolean;
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
  for (const mesh of mapPropMeshes) {
    if (mesh.castShadow) mapPropCastShadowGroups++;
  }

  return {
    meshesInScene,
    castShadowMeshes,
    instancedCastShadow,
    visibleCastShadow,
    mapPropGroups: mapPropMeshes.length,
    mapPropCastShadowGroups,
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
  const { renderer, sun, disableShadowsDev, energy, energyCap } = input;
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
    issues.push('no map prop InstancedMesh groups have castShadow (trees/rocks?)');
  }
  void energy;
  void energyCap;

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
  const trigger = force ? 'manual' : sunCrossedOn ? 'sun-just-on' : 'interval';

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
    castShadowMeshes: counts.castShadowMeshes,
    visibleCastShadow: counts.visibleCastShadow,
    instancedCastShadow: counts.instancedCastShadow,
    mapPropCastShadowGroups: counts.mapPropCastShadowGroups,
    mapPropGroups: counts.mapPropGroups,
    terrainReceiveShadow: input.terrainReceiveShadow,
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
  console.info(
    '[ShadowDebug] ready — __logShadowDebug() / __shadowView(true|false) / __shadowFloor(0..1)',
  );
  // No initial dump — sun is off, so it would just print misleading "issues".

  const w = window as Window & {
    __logShadowDebug?: () => void;
    __shadowView?: (on: boolean) => void;
    __shadowFloor?: (v: number) => void;
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
  w.__shadowFloor = (v: number) => {
    const u = input.terrainMaterial.terrainUniforms;
    if (!u.uShadowFloor) {
      console.warn('[ShadowDebug] terrain has no uShadowFloor uniform');
      return;
    }
    u.uShadowFloor.value = v;
    console.info(`[ShadowDebug] shadow floor = ${v} (0 = pitch-black shadows, 1 = no darkening)`);
  };
}

export function disposeShadowDebug(): void {
  const w = window as Window & {
    __logShadowDebug?: () => void;
    __shadowView?: (on: boolean) => void;
    __shadowFloor?: (v: number) => void;
  };
  delete w.__logShadowDebug;
  delete w.__shadowView;
  delete w.__shadowFloor;
}
