// src/dev/panel/devPanelGodrays.ts — DEV light shafts / god rays (PostFX)
import type { DirectionalLight } from 'three';
import { GODRAYS_MAX_SAMPLES } from '../../config/visual/godrays';
import type { GodraysParams, PostFXContext } from '../../rendering/PostFX';
import { bindRange, injectRangeRows, mountSection, syncSpecs } from '../bindRange';
import {
  ALL_SPECS,
  DENSITY_SPECS,
  type GodraysSpec,
  MASK_SPECS,
  STRENGTH_SPECS,
} from './devPanelGodraysSpecs';

function bindGodraysSpecs(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  specs: GodraysSpec[],
): Array<() => void> {
  const disposers: Array<() => void> = [];
  for (const s of specs) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        postFX.setGodraysParams({ [s.key]: v } as Partial<GodraysParams>);
      }),
    );
  }
  return disposers;
}

export function initDevPanelGodrays(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  sun?: DirectionalLight | null,
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-godrays',
    title: 'Light shafts / god rays',
    open: false,
    body: `
      <p class="dev-hint">Occlusion shafts from a sun disc. Sky is cleared far-plane view distance only — distant trees occlude too. Additive. Samples cap at ${GODRAYS_MAX_SAMPLES}. Shaft <strong>tint + weight</strong> are per Time of day stop. Perf → Disable god rays vs Disable valley fog / Disable distance haze.</p>
      <div id="dev-godrays-strength-rows"></div>
      <div id="dev-godrays-density-rows"></div>
      <details class="dev-subsection">
        <summary>Occlusion / screen fade</summary>
        <div class="dev-section-body" id="dev-godrays-mask-rows"></div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-godrays-diagnose">Log god rays diagnose</button>
        <button type="button" id="dev-godrays-reset">Reset god rays</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const hosts: Array<[string, GodraysSpec[]]> = [
    ['#dev-godrays-strength-rows', STRENGTH_SPECS],
    ['#dev-godrays-density-rows', DENSITY_SPECS],
    ['#dev-godrays-mask-rows', MASK_SPECS],
  ];
  for (const [sel, specs] of hosts) {
    const host = panel.querySelector(sel);
    if (host) injectRangeRows(host, specs);
  }

  const syncUi = () => {
    const params = postFX.getGodraysParams();
    syncSpecs(panel, ALL_SPECS, (s) => {
      const key = (s as GodraysSpec).key;
      return params[key] as number;
    });
  };

  const disposers = bindGodraysSpecs(panel, postFX, ALL_SPECS);

  const resetBtn = panel.querySelector('#dev-godrays-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetGodraysParams();
    syncUi();
  };
  resetBtn?.addEventListener('click', onReset);

  const diagnoseBtn = panel.querySelector('#dev-godrays-diagnose') as HTMLButtonElement | null;
  const onDiagnose = () => {
    if (!sun) {
      console.warn('[godrays diagnose] No sun light wired to the god-rays panel.');
      return;
    }
    postFX.logGodraysDiagnose(sun);
  };
  diagnoseBtn?.addEventListener('click', onDiagnose);

  syncUi();

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
    diagnoseBtn?.removeEventListener('click', onDiagnose);
  };
}
