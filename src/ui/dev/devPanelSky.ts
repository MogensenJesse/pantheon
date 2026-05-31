// src/ui/dev/devPanelSky.ts — live Preetham sky + reveal tuning (DEV)
import { VISUAL } from '../../config/visualTuning';
import { SUN_REVEAL } from '../../rendering/sky/skyDefaults';
import { clearSkyDevOverrides } from '../../rendering/sky/skyDevOverrides';
import { applySkyForReveal } from '../../rendering/sky/skyRevealBlend';
import type { PostFXContext } from '../../rendering/PostFX';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { mountSection } from './bindRange';
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
import { revealTForPanel } from './sky/devPanelSkyShared';

export function initDevPanelSky(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-sky',
    title: 'Sky &amp; atmosphere',
    open: false,
    body: `
      <p class="dev-hint">Preetham sky — live. Sun elevation: energy reveal −5° → 5° over ${SUN_REVEAL.revealDuration}s. Tonemap: AgX.</p>
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
  const disposeHdri = bindNightHdriPanel(panel, sky);

  const syncAll = (t: number) => {
    syncPreethamPanel(panel, t);
    syncNightHdriPanel(panel, sky);
  };
  syncAll(revealTForPanel());

  const resetBtn = panel.querySelector('#dev-sky-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetPreethamSunDev();
    clearSkyDevOverrides();
    resetNightHdriPanel(sky);
    const t = revealTForPanel();
    applySkyForReveal(sky, postFX, t);
    syncAll(t);
    const showDisc = panel.querySelector('#dev-sky-show-sun-disc') as HTMLInputElement | null;
    if (showDisc) showDisc.checked = VISUAL.sky.static.showSunDisc > 0;
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    disposePreetham();
    disposeHdri();
    resetBtn?.removeEventListener('click', onReset);
  };
}
