// src/world/terrain/lod/resolvePlayLodEnabled.ts — play-mode clipmap gate (shipped default + DEV session override)
import { VISUAL } from '../../../config/visualTuning';

export const TERRAIN_LOD_DEV_STORAGE_KEY = 'pantheon.dev.terrainLodEnabled';

/** DEV session override — `null` when unset (use VISUAL default). */
export function readDevLodOverride(): boolean | null {
  if (!import.meta.env.DEV) return null;
  const stored = sessionStorage.getItem(TERRAIN_LOD_DEV_STORAGE_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return null;
}

export function writeDevLodOverride(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem(TERRAIN_LOD_DEV_STORAGE_KEY, enabled ? '1' : '0');
}

export function clearDevLodOverride(): void {
  if (!import.meta.env.DEV) return;
  sessionStorage.removeItem(TERRAIN_LOD_DEV_STORAGE_KEY);
}

/** Whether play mode should build the moving clipmap (editor always uses a single mesh). */
export function resolvePlayLodEnabled(): boolean {
  const override = readDevLodOverride();
  if (override !== null) return override;
  return VISUAL.terrain.lod.enabled;
}
