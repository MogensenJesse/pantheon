// src/ui/DevPanel.ts — development-only cheats and tuning (Vite DEV builds only)
import type { PostFXContext } from '../rendering/PostFX';
import type { SkySystemContext } from '../rendering/sky/SkySystem';
import { USE_HORIZON_CLOUDS } from '../rendering/sky/skyDefaults';
import type { TerrainSplatMaterial } from '../world/terrain/TerrainSplatMaterial';
import { mountDevPanelShell } from './DevPanelLayout';
import { initDevPanelBloom } from './dev/devPanelBloom';
import { initDevPanelClouds } from './dev/devPanelClouds';
import { initDevPanelDof } from './dev/devPanelDof';
import { initDevPanelGameplay } from './dev/devPanelGameplay';
import { initDevPanelGodrays } from './dev/devPanelGodrays';
import { initDevPanelMapEditor } from './dev/devPanelMapEditor';
import { initDevPanelPostFx } from './dev/devPanelPostFx';
import { initDevPanelRenderDebug } from './dev/devPanelRenderDebug';
import { initDevPanelSky } from './dev/devPanelSky';
import { initDevPanelGrass } from './dev/devPanelGrass';
import { initDevPanelTerrain } from './dev/devPanelTerrain';
import { initDevPanelWater } from './dev/devPanelWater';
import type { GrassSystem } from '../world/grass/GrassSystem';

export interface DevPanelTerrainContext {
  terrainMaterial: TerrainSplatMaterial;
  grass?: GrassSystem;
}

export function initDevPanel(
  postFX: PostFXContext,
  terrainCtx?: DevPanelTerrainContext,
  onLogRenderDebug?: () => void,
  skyCtx?: SkySystemContext,
): () => void {
  if (!import.meta.env.DEV) return () => {};

  const { toggle, panel } = mountDevPanelShell();

  const onToggle = () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', onToggle);

  // Section ordering is driven by the shell HTML (see DevPanelLayout).
  // IA: Gameplay -> Look [Glow & bloom, God rays, Post FX, Sky] -> World [Terrain,
  // Clouds] -> Debug. The mount order below does not affect visual order; each
  // section replaces its own host inside the shell.
  const disposers: Array<() => void> = [];
  disposers.push(initDevPanelGameplay(panel));
  disposers.push(initDevPanelBloom(panel, postFX));
  disposers.push(initDevPanelGodrays(panel, postFX));
  disposers.push(initDevPanelDof(panel, postFX));

  disposers.push(initDevPanelMapEditor(panel));
  if (terrainCtx) {
    disposers.push(initDevPanelTerrain(panel, terrainCtx.terrainMaterial));
    if (terrainCtx.grass) {
      disposers.push(initDevPanelGrass(panel, terrainCtx.grass));
    }
  }

  disposers.push(initDevPanelPostFx(panel, postFX));

  if (skyCtx) {
    disposers.push(initDevPanelSky(panel, skyCtx, postFX));
  }
  disposers.push(initDevPanelWater(panel));
  if (USE_HORIZON_CLOUDS) {
    disposers.push(initDevPanelClouds(panel));
  }

  disposers.push(initDevPanelRenderDebug(panel, postFX, onLogRenderDebug));

  return () => {
    for (const fn of disposers) fn();
    toggle.removeEventListener('click', onToggle);
    toggle.remove();
    panel.remove();
  };
}
