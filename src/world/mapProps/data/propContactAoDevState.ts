// src/world/mapProps/data/propContactAoDevState.ts — DEV live terrain-AO bake overrides + rebake
import { VISUAL } from '../../../config/visualTuning';

export type TerrainAoBakeLive = {
  enabled: boolean;
  radiusM: number;
  baseHeightM: number;
  coreHeightM: number;
};

export type TerrainAoBakeShapeKey = 'radiusM' | 'baseHeightM' | 'coreHeightM';

const shipped = (): TerrainAoBakeLive => {
  const ao = VISUAL.props.groundContact.terrainAo;
  return {
    enabled: ao.enabled,
    radiusM: ao.radiusM,
    baseHeightM: ao.baseHeightM,
    coreHeightM: ao.coreHeightM,
  };
};

let overrides: Partial<Record<TerrainAoBakeShapeKey, number>> = {};
let rebakeFn: (() => void) | null = null;
let rebakeTimer: ReturnType<typeof setTimeout> | null = null;
const rebakedListeners = new Set<() => void>();

/** Shipped VISUAL.terrainAo bake knobs merged with DEV shape overrides. */
export function getLiveTerrainAoBakeSettings(): TerrainAoBakeLive {
  const base = shipped();
  if (!import.meta.env.DEV || Object.keys(overrides).length === 0) return base;
  return { ...base, ...overrides };
}

export function setTerrainAoBakeOverride(key: TerrainAoBakeShapeKey, value: number): void {
  if (!import.meta.env.DEV) return;
  overrides[key] = value;
  requestPropContactAoRebake();
}

export function resetTerrainAoBakeOverrides(): void {
  overrides = {};
  requestPropContactAoRebake();
}

export function readTerrainAoBakeOverride(key: TerrainAoBakeShapeKey): number {
  return getLiveTerrainAoBakeSettings()[key];
}

/** DEV: register in-place rebake after world build (cleared on terrain dispose). */
export function bindPropContactAoRebake(fn: (() => void) | null): void {
  if (!import.meta.env.DEV) return;
  if (rebakeTimer != null) {
    clearTimeout(rebakeTimer);
    rebakeTimer = null;
  }
  rebakeFn = fn;
}

/**
 * DEV: be told after the terrain AO is re-baked in place. The bake rewrites the whole texture, so
 * anything another system stamped into it must be applied again. Returns an unsubscribe.
 */
export function onPropContactAoRebaked(fn: () => void): () => void {
  rebakedListeners.add(fn);
  return () => {
    rebakedListeners.delete(fn);
  };
}

/** Debounced rebake so slider drags don't stamp every input event. */
export function requestPropContactAoRebake(): void {
  if (!import.meta.env.DEV || !rebakeFn) return;
  if (rebakeTimer != null) clearTimeout(rebakeTimer);
  rebakeTimer = setTimeout(() => {
    rebakeTimer = null;
    rebakeFn?.();
    for (const fn of rebakedListeners) fn();
  }, 120);
}
