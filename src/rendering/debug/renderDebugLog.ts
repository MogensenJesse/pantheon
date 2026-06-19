// src/rendering/debug/renderDebugLog.ts — DEV diagnostics for sky / bloom
import type { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import { CAMERA_FAR, SKY_SCALE } from '../sceneConstants';

// Logging is strictly on-demand — trigger a frame snapshot from the dev panel.

export interface RenderDebugSnapshot {
  camera: PerspectiveCamera;
  sun: DirectionalLight;
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

export function logRenderDebugInit(scene: Scene, camera: PerspectiveCamera): void {
  if (!import.meta.env.DEV) return;
  console.info('[RenderDebug] init', {
    skyScale: SKY_SCALE,
    cameraFar: CAMERA_FAR,
    cameraNear: camera.near,
    sceneBackground: scene.background,
    expectBelow100Energy: {
      sky: 'Preetham SkyMesh — analytic Rayleigh+Mie (Heckel tier-1; no ozone/LUT)',
      fog: 'densityFogFactor aerial haze (simplified vs Heckel aerial-perspective LUT)',
      godRays: 'GodraysNode + bilateralBlur (skipped when weight 0) + depthAwareBlend',
      sunIntensity: 0,
      treeShadows: 'none until 100% energy',
      bloom: 'scene-output bloom (single RT; glow via HDR color on orbs)',
    },
  });
}

export function logRenderDebugFrame(snapshot: RenderDebugSnapshot): void {
  if (!import.meta.env.DEV) return;

  const { camera, sun, elapsed, energy, energyCap, orbCount, orbVisibleCount } = snapshot;
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
    orbCount,
    orbVisibleCount,
    status: energy < energyCap ? 'pre-reveal (sun off by design)' : 'sun reveal active or complete',
  });
}
