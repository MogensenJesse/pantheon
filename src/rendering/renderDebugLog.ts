// src/rendering/renderDebugLog.ts — DEV diagnostics for sky / clouds / bloom
import type { DirectionalLight, Mesh, PerspectiveCamera, Scene } from 'three';
import { CAMERA_FAR, SKY_SCALE } from './SkySystem';

let lastLogMs = 0;
const LOG_INTERVAL_MS = 3000;

export interface RenderDebugSnapshot {
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  cloudsVisible: boolean;
  elapsed: number;
  energy: number;
  energyCap: number;
  orbCount: number;
  orbVisibleCount: number;
}

function sunAzimuthDeg(sun: DirectionalLight): number {
  const d = sun.position.clone().sub(sun.target.position).normalize();
  return Math.round((Math.atan2(d.x, d.z) * 180) / Math.PI);
}

function sunElevationDeg(sun: DirectionalLight): number {
  const d = sun.position.clone().sub(sun.target.position).normalize();
  return Math.round((Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI);
}

export function logRenderDebugInit(scene: Scene, camera: PerspectiveCamera, clouds: Mesh): void {
  if (!import.meta.env.DEV) return;
  console.info('[RenderDebug] init', {
    skyScale: SKY_SCALE,
    cameraFar: CAMERA_FAR,
    cameraNear: camera.near,
    sceneBackground: scene.background,
    cloudsVisible: clouds.visible,
    cloudsFrustumCulled: clouds.frustumCulled,
    cloudsRenderOrder: clouds.renderOrder,
    cloudMaterial: {
      transparent: (clouds.material as { transparent?: boolean }).transparent,
      depthTest: (clouds.material as { depthTest?: boolean }).depthTest,
      depthWrite: (clouds.material as { depthWrite?: boolean }).depthWrite,
    },
    expectBelow100Energy: {
      sky: 'blue gradient (not flat black)',
      sunDisc: 'faint bright spot when looking toward sunAzimuth / sunElevation',
      clouds: 'soft gray haze on horizon / sky (not terrain)',
      sunIntensity: 0,
      treeShadows: 'none until 100% energy',
      bloom: 'scene-output bloom (single RT; glow via HDR color on orbs)',
    },
  });
}

export function logRenderDebugFrame(snapshot: RenderDebugSnapshot, force = false): void {
  if (!import.meta.env.DEV) return;
  const now = performance.now();
  if (!force && now - lastLogMs < LOG_INTERVAL_MS) return;
  lastLogMs = now;

  const { camera, sun, cloudsVisible, elapsed, energy, energyCap, orbCount, orbVisibleCount } =
    snapshot;
  const camPos = camera.position;
  const sunDir = sun.position.clone().sub(sun.target.position).normalize();

  console.info('[RenderDebug] frame', {
    elapsed: elapsed.toFixed(1),
    energy: `${energy}/${energyCap}`,
    sunIntensity: sun.intensity,
    sunDir: sunDir.toArray().map((v) => +v.toFixed(3)),
    sunAzimuthDeg: sunAzimuthDeg(sun),
    sunElevationDeg: sunElevationDeg(sun),
    lookForSunDisc: `pan camera toward azimuth ~${sunAzimuthDeg(sun)}°, elevation ~${sunElevationDeg(sun)}°`,
    cameraPos: camPos.toArray().map((v) => +v.toFixed(2)),
    distToOrigin: camPos.length().toFixed(1),
    insideCloudShell: camPos.length() < 380,
    insideSkyShell: camPos.length() < SKY_SCALE,
    cloudsMeshVisible: cloudsVisible,
    orbCount,
    orbVisibleCount,
    status:
      energy < energyCap
        ? 'pre-reveal (sun off by design)'
        : 'sun reveal active or complete',
  });
}

export function logRenderDebugSky(
  clouds: Mesh,
  sun: DirectionalLight,
  daylight: number,
): void {
  if (!import.meta.env.DEV) return;
  const sunDir = sun.position.clone().sub(sun.target.position).normalize();
  console.info('[RenderDebug] sky', {
    daylight,
    sunDir: sunDir.toArray().map((v) => +v.toFixed(3)),
    sunAzimuthDeg: sunAzimuthDeg(sun),
    sunElevationDeg: sunElevationDeg(sun),
    cloudsInScene: clouds.parent !== null,
    cloudsVisible: clouds.visible,
    ifNoCloudsVisible:
      'try dev Hide terrain + look at horizon; clouds are a shell around the island (not volumetric fog on ground)',
  });
}
