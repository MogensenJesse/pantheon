// src/ui/DevPanel.ts — development-only cheats and tuning (Vite DEV builds only)
import type { AmbientLight, DirectionalLight } from 'three';
import type { PostFXContext } from '../rendering/PostFX';
import type { SkySystemContext } from '../rendering/sky/SkySystem';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import type { TerrainSplatMaterial, TerrainLodVertexStats } from '../world/terrain';
import { mountDevPanelShell } from './DevPanelLayout';
import { initDevPanelBloom } from './dev/devPanelBloom';
import { initDevPanelDof } from './dev/devPanelDof';
import { initDevPanelGameplay } from './dev/devPanelGameplay';
import { initDevPanelGodrays } from './dev/devPanelGodrays';
import { initDevPanelGrass } from './dev/devPanelGrass';
import { initDevPanelMapEditor } from './dev/devPanelMapEditor';
import { initDevPanelPostFx } from './dev/devPanelPostFx';
import { initDevPanelRenderDebug } from './dev/devPanelRenderDebug';
import { initDevPanelShadows, type DevPanelShadowContext } from './dev/devPanelShadows';
import { initDevPanelSky } from './dev/devPanelSky';
import { initDevPanelTerrain } from './dev/devPanelTerrain';
import { initDevPanelWater } from './dev/devPanelWater';

export type { DevPanelShadowContext };

export interface DevPanelTerrainContext {
  terrainMaterial: TerrainSplatMaterial;
  hasDisplacementMaps?: boolean;
  grass?: GrassSystem;
  lodEnabled?: boolean;
  lodVertexStats?: TerrainLodVertexStats;
}

export interface DevPanelSkyContext {
  sky: SkySystemContext;
  sun: DirectionalLight;
  ambientLight: AmbientLight;
}

export function initDevPanel(
  postFX: PostFXContext,
  terrainCtx?: DevPanelTerrainContext,
  onLogRenderDebug?: () => void,
  skyCtx?: DevPanelSkyContext,
  shadowCtx?: DevPanelShadowContext,
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
  // Grass, Shadows, Water] -> Debug. The mount order below does not affect visual order;
  // each section replaces its own host inside the shell.
  const disposers: Array<() => void> = [];
  disposers.push(initDevPanelGameplay(panel, skyCtx ? { ...skyCtx, postFX } : undefined));
  disposers.push(initDevPanelBloom(panel, postFX));
  disposers.push(initDevPanelGodrays(panel, postFX));
  disposers.push(initDevPanelDof(panel, postFX));

  disposers.push(initDevPanelMapEditor(panel));
  if (terrainCtx) {
    disposers.push(
      initDevPanelTerrain(panel, terrainCtx.terrainMaterial, terrainCtx.hasDisplacementMaps ?? false, {
        lodEnabled: terrainCtx.lodEnabled ?? false,
        vertexStats: terrainCtx.lodVertexStats,
      }),
    );
    if (terrainCtx.grass) {
      disposers.push(initDevPanelGrass(panel, terrainCtx.grass));
    }
  }

  if (shadowCtx) {
    disposers.push(initDevPanelShadows(panel, shadowCtx));
  }

  disposers.push(initDevPanelPostFx(panel, postFX));

  if (skyCtx) {
    disposers.push(initDevPanelSky(panel, skyCtx.sky, postFX, skyCtx.sun, skyCtx.ambientLight));
  }
  disposers.push(initDevPanelWater(panel));

  disposers.push(initDevPanelRenderDebug(panel, postFX, onLogRenderDebug));

  return () => {
    for (const fn of disposers) fn();
    toggle.removeEventListener('click', onToggle);
    toggle.remove();
    panel.remove();
  };
}
