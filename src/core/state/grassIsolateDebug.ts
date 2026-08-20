// src/core/state/grassIsolateDebug.ts — Perf panel per-ring / flower hide flags
import type { RenderDebugSettings } from './settingsTypes';

/** Object3D names from grassRingField / flowerRingField. */
export const GRASS_ISOLATE_RING_ROOT_NAMES = [
  'grassRing0Root',
  'grassRing1Root',
  'grassRing2Root',
] as const;

export const GRASS_ISOLATE_FLOWER_ROOT_NAME = 'flowerFieldRoot';

export function grassIsolateRingHidden(settings: RenderDebugSettings, ringIndex: number): boolean {
  if (ringIndex === 0) return settings.hideGrassLod0;
  if (ringIndex === 1) return settings.hideGrassLod1;
  return settings.hideGrassLod2;
}

export function grassIsolateFlowerHidden(settings: RenderDebugSettings): boolean {
  return settings.hideGrassFlowers;
}

/** Cheap dirty key so GrassSystem can force compact when isolates change. */
export function grassIsolateKey(settings: RenderDebugSettings): string {
  return `${settings.hideGrassLod0 ? 1 : 0}${settings.hideGrassLod1 ? 1 : 0}${settings.hideGrassLod2 ? 1 : 0}${settings.hideGrassFlowers ? 1 : 0}`;
}
