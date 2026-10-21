// src/core/gameTickDevOverrides.ts — DEV-only per-frame hooks of gameTick.render
import { runDevPanelLateTicks } from '../dev/panelTickHooks';
import type { ShadowDebugInput } from '../rendering/debug/shadowDebugLog';
import { applyGrassDevUniforms } from '../world/grass/config/applyGrassDevUniforms';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';
import { applyTerrainDevUniforms } from '../world/terrain';
import { devDebugSettings, devSettings, runtimeSettings } from './settings';

export interface DevFrameTickContext {
  grassSystem?: GrassSystem;
  terrain: MapTerrainContext;
  shadowDebugInput: ShadowDebugInput;
}

/** Mid-frame DEV hooks (grass visibility, terrain uniforms). */
export function applyDevFrameOverridesMid(ctx: DevFrameTickContext): void {
  if (!import.meta.env.DEV) return;

  if (ctx.grassSystem && runtimeSettings.grass.enabled !== ctx.grassSystem.mesh.visible) {
    ctx.grassSystem.mesh.visible = runtimeSettings.grass.enabled;
  }

  if (runtimeSettings.terrain.dirty) {
    applyTerrainDevUniforms(ctx.terrain.splatMaterial);
  }

  if (devSettings.grass.dirty) {
    applyGrassDevUniforms();
  }
}

/** Late-frame DEV hooks (shadow debug input, live panel sync). */
export function applyDevFrameOverridesLate(ctx: DevFrameTickContext): void {
  if (!import.meta.env.DEV) return;

  ctx.shadowDebugInput.disableShadowsDev = devDebugSettings.renderDebug.disableShadows;
  runDevPanelLateTicks();
}
