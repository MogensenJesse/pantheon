// src/ui/dev/devPanelSky.ts — live Preetham sky + reveal tuning (DEV)
import type { AmbientLight, DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { clearSkyDevOverrides } from '../../rendering/sky/skyDevOverrides';
import { applySkyForReveal } from '../../rendering/sky/skyRevealBlend';
import { mountSection } from './bindRange';
import {
  bindDayCyclePanel,
  dayCycleSubsectionHtml,
  resetDayCyclePanel,
  syncDayCyclePanel,
} from './sky/devPanelDayCycle';
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
import { atmosphereBlendTForPanel, elevationForPanel } from './sky/devPanelSkyShared';

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
      ${nightHdriSubsectionHtml()}
      <div class="dev-actions">
        <button type="button" id="dev-sky-reset">Reset sky</button>
      </div>
    `,
  });
  if (!body) return () => {};

  setupNightHdriSubsection(panel, sky);

  const disposePreetham = bindPreethamSkyPanel(panel, sky, postFX);
  const disposeDayCycle = bindDayCyclePanel(panel, sky, postFX, sun, ambientLight);
  const disposeHdri = bindNightHdriPanel(panel, sky);

  const syncAll = (t: number) => {
    syncPreethamPanel(panel, t);
    syncNightHdriPanel(panel, sky);
    syncDayCyclePanel(panel);
  };
  syncAll(atmosphereBlendTForPanel());

  const resetBtn = panel.querySelector('#dev-sky-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetPreethamSunDev();
    clearSkyDevOverrides();
    resetNightHdriPanel(sky);
    resetDayCyclePanel(panel, sky, postFX, sun, ambientLight);
    const t = atmosphereBlendTForPanel();
    applySkyForReveal(sky, postFX, elevationForPanel());
    syncAll(t);
    const showDisc = panel.querySelector('#dev-sky-show-sun-disc') as HTMLInputElement | null;
    if (showDisc) showDisc.checked = VISUAL.sky.static.showSunDisc > 0;
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    disposePreetham();
    disposeDayCycle();
    disposeHdri();
    resetBtn?.removeEventListener('click', onReset);
  };
}
