// src/dev/panel/devPanelSky.ts — live Preetham sky + reveal tuning (DEV)
import type { AmbientLight, DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { clearSkyDevOverrides } from '../../rendering/sky/skyDevOverrides';
import { applySkyForReveal } from '../../rendering/sky/skyRevealBlend';
import { mountSection } from '../bindRange';
import {
  bindDayCyclePanel,
  dayCycleSubsectionHtml,
  resetDayCyclePanel,
  syncDayCyclePanel,
} from './sky/devPanelDayCycle';
import {
  bindNightAuroraPanel,
  nightAuroraSubsectionHtml,
  resetNightAuroraPanel,
  setupNightAuroraSubsection,
  syncNightAuroraPanel,
} from './sky/devPanelNightAurora';
import {
  bindNightHdriPanel,
  nightHdriSubsectionHtml,
  resetNightHdriPanel,
  setupNightHdriSubsection,
  syncNightHdriPanel,
} from './sky/devPanelNightHdri';
import {
  bindPreethamSkyPanel,
  preethamSkyBodyHtml,
  resetPreethamSunDev,
  syncPreethamPanel,
} from './sky/devPanelSkyPreetham';
import { elevationForPanel } from './sky/devPanelSkyShared';
import { syncTodStopFromElevation } from './devPanelTod';

export function initDevPanelSky(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
  sun: DirectionalLight,
  ambientLight: AmbientLight,
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-sky',
    title: 'Sky &amp; atmosphere',
    open: false,
    body: `
      <p class="dev-hint">Preetham sky — live. At 100% energy: ${VISUAL.sky.cycle.revealSunrise.durationSec}s reveal sunrise to ${VISUAL.sky.cycle.revealSunrise.targetElevationDeg}°, then ${VISUAL.sky.cycle.dayDurationSec}s day loop. Tonemap: AgX.</p>
      ${dayCycleSubsectionHtml()}
      ${preethamSkyBodyHtml()}
      ${nightAuroraSubsectionHtml()}
      ${nightHdriSubsectionHtml()}
      <div class="dev-actions">
        <button type="button" id="dev-sky-reset">Reset sky</button>
      </div>
    `,
  });
  if (!body) return () => {};

  setupNightAuroraSubsection(panel, sky);
  setupNightHdriSubsection(panel, sky);

  const disposePreetham = bindPreethamSkyPanel(panel, sky, postFX);
  const disposeDayCycle = bindDayCyclePanel(
    panel,
    sky,
    postFX,
    sun,
    ambientLight,
    (elev) => syncTodStopFromElevation(elev),
  );
  const disposeAurora = bindNightAuroraPanel(panel, sky);
  const disposeHdri = bindNightHdriPanel(panel, sky);

  const syncAll = () => {
    syncPreethamPanel(panel);
    syncNightAuroraPanel(panel, sky);
    syncNightHdriPanel(panel, sky);
    syncDayCyclePanel(panel);
  };
  syncAll();

  const resetBtn = panel.querySelector('#dev-sky-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetPreethamSunDev();
    clearSkyDevOverrides();
    resetNightAuroraPanel(sky);
    resetNightHdriPanel(sky);
    resetDayCyclePanel(panel, sky, postFX, sun, ambientLight);
    applySkyForReveal(sky, postFX, elevationForPanel());
    syncAll();
    const showDisc = panel.querySelector('#dev-sky-show-sun-disc') as HTMLInputElement | null;
    if (showDisc) showDisc.checked = VISUAL.sky.static.showSunDisc > 0;
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    disposePreetham();
    disposeDayCycle();
    disposeAurora();
    disposeHdri();
    resetBtn?.removeEventListener('click', onReset);
  };
}
