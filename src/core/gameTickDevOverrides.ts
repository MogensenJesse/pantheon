// src/core/gameTickDevOverrides.ts — DEV-only per-frame hooks extracted from gameTick.render
import { runDevPanelLateTicks } from '../dev/panelTickHooks';
import type { ShadowDebugInput } from '../rendering/debug/shadowDebugLog';
import type { SunHorizonTracker } from '../rendering/postfx/sunHorizonOcclusion';
import { applyGrassDevUniforms } from '../world/grass/config/applyGrassDevUniforms';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import type { WorldTerrain } from '../world/MapTerrainBuilder';
import { applyTerrainDevUniforms } from '../world/terrain';
import { devDebugSettings, devSettings, runtimeSettings } from './GameState';

export interface DevFrameTickContext {
  grassSystem?: GrassSystem;
  terrain: WorldTerrain;
  shadowDebugInput: ShadowDebugInput;
  sunHorizonTracker: SunHorizonTracker;
}

function syncHorizonTrackerConfigDev(sunHorizonTracker: SunHorizonTracker): void {
  const h = devDebugSettings.godraysHorizon;
  const cur = sunHorizonTracker.getConfig();
  if (
    cur.maxDistanceM === h.maxDistanceM &&
    cur.sampleCount === h.sampleCount &&
    cur.rayFanCount === h.rayFanCount &&
    cur.rayFanSpreadDeg === h.rayFanSpreadDeg &&
    cur.smoothRatePerSec === h.smoothRatePerSec
  ) {
    return;
  }
  sunHorizonTracker.setConfig({
    maxDistanceM: h.maxDistanceM,
    sampleCount: h.sampleCount,
    rayFanCount: h.rayFanCount,
    rayFanSpreadDeg: h.rayFanSpreadDeg,
    smoothRatePerSec: h.smoothRatePerSec,
  });
}

/** Mid-frame DEV hooks (grass visibility, terrain uniforms, god-ray horizon config). */
export function applyDevFrameOverridesMid(ctx: DevFrameTickContext): void {
  if (!import.meta.env.DEV) return;

  if (ctx.grassSystem && runtimeSettings.grass.enabled !== ctx.grassSystem.mesh.visible) {
    ctx.grassSystem.mesh.visible = runtimeSettings.grass.enabled;
  }

  if (runtimeSettings.terrain.dirty) {
    const terrainMaterials = ctx.terrain.macroSplatMaterial
      ? [ctx.terrain.splatMaterial, ctx.terrain.macroSplatMaterial]
      : ctx.terrain.splatMaterial;
    applyTerrainDevUniforms(terrainMaterials);
  }

  if (devSettings.grass.dirty) {
    applyGrassDevUniforms();
  }

  syncHorizonTrackerConfigDev(ctx.sunHorizonTracker);
}

/** Late-frame DEV hooks (shadow debug input, live panel sync). */
export function applyDevFrameOverridesLate(ctx: DevFrameTickContext): void {
  if (!import.meta.env.DEV) return;

  ctx.shadowDebugInput.disableShadowsDev = devDebugSettings.renderDebug.disableShadows;
  runDevPanelLateTicks();
}
