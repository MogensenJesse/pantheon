// src/ui/DevPanel.ts — development-only cheats and tuning (Vite DEV builds only)
import type { AmbientLight, DirectionalLight } from 'three';
import type { PostFXContext } from '../rendering/PostFX';
import type { MeshCloudSystemContext } from '../rendering/clouds/MeshCloudSystem';
import type { SkySystemContext } from '../rendering/sky/SkySystem';
import type { GrassSystem } from '../world/grass/core/GrassSystem';
import type { TerrainLodVertexStats } from '../world/terrain';
import { mountDevPanelShell } from './DevPanelLayout';
import { initDevPanelBloom } from './dev/devPanelBloom';
import { initDevPanelDof } from './dev/devPanelDof';
import { initDevPanelGameplay } from './dev/devPanelGameplay';
import { initDevPanelGodrays } from './dev/devPanelGodrays';
import { initDevPanelGrass } from './dev/devPanelGrass';
import { initDevPanelHaze } from './dev/devPanelHaze';
import { initDevPanelMapEditor } from './dev/devPanelMapEditor';
import { initDevPanelPostFx } from './dev/devPanelPostFx';
import { initDevPanelRenderDebug } from './dev/devPanelRenderDebug';
import { type DevPanelShadowContext, initDevPanelShadows } from './dev/devPanelShadows';
import { initDevPanelSky } from './dev/devPanelSky';
import { initDevPanelClouds } from './dev/sky/devPanelClouds';
import { initDevPanelVolumetricClouds } from './dev/sky/devPanelVolumetricClouds';
import { initDevPanelTerrain } from './dev/devPanelTerrain';
import { initDevPanelUpscaling } from './dev/devPanelUpscaling';
import { initDevPanelWater } from './dev/devPanelWater';

export type { DevPanelShadowContext };

export interface DevPanelTerrainContext {
  hasDisplacementMaps?: boolean;
  grass?: GrassSystem;
  lodEnabled?: boolean;
  lodVertexStats?: TerrainLodVertexStats;
}

export interface DevPanelSkyContext {
  sky: SkySystemContext;
  sun: DirectionalLight;
  ambientLight: AmbientLight;
  cloudSystem?: MeshCloudSystemContext | null;
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
  // IA: Gameplay (open) -> Look group (open) [nested sections collapsed]
  //     -> World group (open) [nested sections collapsed] -> Debug (open).
  // Mount order below does not affect visual order; each section replaces its host in the shell.
  const disposers: Array<() => void> = [];
  disposers.push(initDevPanelGameplay(panel, skyCtx ? { ...skyCtx, postFX } : undefined));
  disposers.push(initDevPanelBloom(panel, postFX));
  disposers.push(initDevPanelGodrays(panel, postFX));
  disposers.push(initDevPanelHaze(panel));
  disposers.push(initDevPanelDof(panel, postFX));

  disposers.push(initDevPanelMapEditor(panel));
  if (terrainCtx) {
    disposers.push(
      initDevPanelTerrain(panel, terrainCtx.hasDisplacementMaps ?? false, {
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
    disposers.push(initDevPanelClouds(panel, skyCtx.cloudSystem));
    disposers.push(initDevPanelVolumetricClouds(panel, postFX));
  }
  disposers.push(initDevPanelWater(panel));

  disposers.push(initDevPanelUpscaling(panel, postFX));
  disposers.push(initDevPanelRenderDebug(panel, postFX, onLogRenderDebug));

  return () => {
    for (const fn of disposers) fn();
    toggle.removeEventListener('click', onToggle);
    toggle.remove();
    panel.remove();
  };
}
