// src/ui/DevPanel.ts — development-only cheats and tuning (Vite DEV builds only)
import type { PostFXContext } from '../rendering/PostFX';
import type { SkySystemContext } from '../rendering/SkySystem';
import type { TerrainSplatMaterial } from '../world/terrain/TerrainSplatMaterial';
import type { AssetScatterer } from '../world/AssetScatterer';
import { initDevPanelClouds } from './dev/devPanelClouds';
import { initDevPanelGameplay } from './dev/devPanelGameplay';
import { initDevPanelGrass } from './dev/devPanelGrass';
import { initDevPanelPostFx } from './dev/devPanelPostFx';
import { initDevPanelRenderDebug } from './dev/devPanelRenderDebug';
import { initDevPanelSky } from './dev/devPanelSky';
import { initDevPanelTerrain } from './dev/devPanelTerrain';
import { mountDevPanelShell } from './DevPanelLayout';

export interface DevPanelTerrainContext {
  terrainMaterial: TerrainSplatMaterial;
  scatterer?: AssetScatterer;
}

export function initDevPanel(
  postFX: PostFXContext,
  terrainCtx?: DevPanelTerrainContext,
  onLogRenderDebug?: () => void,
  skyCtx?: SkySystemContext,
): () => void {
  if (!import.meta.env.DEV) return () => {};

  const { toggle, panel } = mountDevPanelShell();

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  const unsubGameplay = initDevPanelGameplay(panel);
  initDevPanelPostFx(panel, postFX);
  initDevPanelRenderDebug(panel, postFX, onLogRenderDebug);

  if (skyCtx) {
    initDevPanelSky(panel, skyCtx, postFX);
  } else {
    panel.querySelector('#dev-section-sky')?.remove();
  }

  initDevPanelClouds(panel);

  const grassSection = panel.querySelector('#dev-section-grass');
  if (terrainCtx?.scatterer && panel.querySelector('#dev-grass-wind-strength')) {
    initDevPanelGrass(panel, terrainCtx.scatterer);
  } else {
    grassSection?.remove();
  }

  const texRepeatSlider = panel.querySelector('#dev-tex-repeat');
  if (terrainCtx && texRepeatSlider) {
    initDevPanelTerrain(panel, terrainCtx.terrainMaterial);
  } else {
    panel.querySelector('#dev-section-terrain')?.remove();
  }

  postFX.setPixelSize(1);
  postFX.setColorLevels(1);

  return unsubGameplay;
}
