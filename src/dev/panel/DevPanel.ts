// src/dev/panel/DevPanel.ts — development-only cheats and tuning (Vite DEV builds only)
import type { AmbientLight, DirectionalLight } from 'three';
import type { MeshCloudSystemContext } from '../../rendering/clouds/MeshCloudSystem';
import type { PostFXContext } from '../../rendering/PostFX';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import type { GrassSystem } from '../../world/grass/core/GrassSystem';
import type { TerrainLodVertexStats } from '../../world/terrain';
import { mountDevPanelShell } from './DevPanelLayout';
import { initDevPanelBloom } from './devPanelBloom';
import { initDevPanelDof } from './devPanelDof';
import { initDevPanelGameplay } from './devPanelGameplay';
import { initDevPanelGodrays } from './devPanelGodrays';
import { initDevPanelGrass } from './devPanelGrass';
import { initDevPanelHaze } from './devPanelHaze';
import { initDevPanelMapEditor } from './devPanelMapEditor';
import { initDevPanelPostFx } from './devPanelPostFx';
import { type DevPanelPropLodContext, initDevPanelPropLod } from './devPanelPropLod';
import { initDevPanelRenderDebug } from './devPanelRenderDebug';
import { type DevPanelShadowContext, initDevPanelShadows } from './devPanelShadows';
import { initDevPanelSky } from './devPanelSky';
import { initDevPanelTerrain } from './devPanelTerrain';
import { initDevPanelUpscaling } from './devPanelUpscaling';
import { initDevPanelWater } from './devPanelWater';
import { initDevPanelClouds } from './sky/devPanelClouds';

export type { DevPanelPropLodContext, DevPanelShadowContext };

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
  propLodCtx?: DevPanelPropLodContext,
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
  disposers.push(initDevPanelGodrays(panel, postFX, skyCtx?.sun));
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

  if (propLodCtx) {
    disposers.push(initDevPanelPropLod(panel, propLodCtx));
  }

  if (shadowCtx) {
    disposers.push(initDevPanelShadows(panel, shadowCtx));
  }

  disposers.push(initDevPanelPostFx(panel, postFX));

  if (skyCtx) {
    disposers.push(initDevPanelSky(panel, skyCtx.sky, postFX, skyCtx.sun, skyCtx.ambientLight));
    disposers.push(initDevPanelClouds(panel, skyCtx.cloudSystem));
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
