// src/rendering/debug/renderDebugLog.ts — DEV diagnostics for sky / bloom
import type { DirectionalLight, PerspectiveCamera } from 'three';

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
