// src/rendering/sky/hdri/nightHdriRuntime.ts — live night HDRI tunables (defaults from visualTuning)
import { VISUAL } from '../../../config/visualTuning';

export interface NightHdriTuning {
  intensity: number;
  rotationY: number;
  fadeElevationStart: number;
  fadeElevationEnd: number;
}

function defaultsFromVisual(): NightHdriTuning {
  const h = VISUAL.sky.nightHdri;
  return {
    intensity: h.intensity,
    rotationY: h.rotationY,
    fadeElevationStart: h.fadeElevationStart,
    fadeElevationEnd: h.fadeElevationEnd,
  };
}

let tuning = defaultsFromVisual();

export function getNightHdriTuning(): Readonly<NightHdriTuning> {
  return tuning;
}

export function setNightHdriTuning(partial: Partial<NightHdriTuning>): void {
  tuning = { ...tuning, ...partial };
}

export function resetNightHdriTuning(): void {
  tuning = defaultsFromVisual();
}
