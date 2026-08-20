// src/dev/panel/devPanelGodrays.ts — DEV light shafts / god rays (PostFX)
import type { DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { GodraysParams, PostFXContext } from '../../rendering/PostFX';
import { resetGodraysHorizonDev } from '../../rendering/postfx/godraysHorizonDevDefaults';
import { bindCheckbox, bindRange, injectRangeRows, mountSection, syncSpecs } from '../bindRange';
import {
  ALL_SPECS,
  DENSITY_SPECS,
  EDGE_SPECS,
  type GodraysSpec,
  HORIZON_SPECS,
  type HorizonSpec,
  MASK_SPECS,
  STRENGTH_SPECS,
  SUN_SPECS,
  TINT_SPECS,
} from './devPanelGodraysSpecs';

const G = VISUAL.godrays;

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
      <p class="dev-hint">Volumetric shafts sample directional PCSS color-depth (or depth-compare). Disable via the Perf panel. Isolate haze with Disable haze. Raymarch steps are live; blur sigma (${G.BLUR_SIGMA} / ${G.BLUR_SIGMA_COLOR}) needs reload.</p>
      <div id="dev-godrays-strength-rows"></div>
      <div id="dev-godrays-density-rows"></div>
      <div id="dev-godrays-tint-rows"></div>
      <div id="dev-godrays-edge-rows"></div>
      <details class="dev-subsection">
        <summary>Sky mask</summary>
        <div class="dev-section-body" id="dev-godrays-mask-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Sun elevation scaling</summary>
        <div class="dev-section-body" id="dev-godrays-sun-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Horizon occlusion</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Samples the terrain-silhouette angle toward the sun so rays stay off while a mountain still blocks it. Disable to compare against flat-ground (old) behavior.</p>
          <label class="dev-row dev-row-check">
            <span>Horizon occlusion enabled</span>
            <input type="checkbox" id="dev-godrays-horizon-enabled" />
          </label>
          <div id="dev-godrays-horizon-rows"></div>
          <div class="dev-actions">
            <button type="button" id="dev-godrays-horizon-reset">Reset horizon occlusion</button>
          </div>
        </div>
      </details>
      <p class="dev-hint">Blur sigma (${G.BLUR_SIGMA} / ${G.BLUR_SIGMA_COLOR}) is fixed until reload — edit visualTuning.ts. Raymarch steps are live on the Density panel.</p>
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
    ['#dev-godrays-tint-rows', TINT_SPECS],
    ['#dev-godrays-edge-rows', EDGE_SPECS],
    ['#dev-godrays-mask-rows', MASK_SPECS],
    ['#dev-godrays-sun-rows', SUN_SPECS],
  ];
  for (const [sel, specs] of hosts) {
    const host = panel.querySelector(sel);
    if (host) injectRangeRows(host, specs);
  }

  const horizonHost = panel.querySelector('#dev-godrays-horizon-rows');
  if (horizonHost) injectRangeRows(horizonHost, HORIZON_SPECS);

  const syncUi = () => {
    const params = postFX.getGodraysParams();
    syncSpecs(panel, ALL_SPECS, (s) => params[(s as GodraysSpec).key]);
  };

  const disposers = bindGodraysSpecs(panel, postFX, ALL_SPECS);

  const horizonSettings = devSettings.godraysHorizon;
  const syncHorizonUi = () => {
    syncSpecs(panel, HORIZON_SPECS, (s) => horizonSettings[(s as HorizonSpec).key]);
  };
  for (const s of HORIZON_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        horizonSettings[s.key] = v;
      }),
    );
  }
  const unbindHorizonEnabled = bindCheckbox(
    panel,
    'dev-godrays-horizon-enabled',
    () => horizonSettings.enabled,
    (v) => {
      horizonSettings.enabled = v;
    },
  );
  disposers.push(unbindHorizonEnabled);
  syncHorizonUi();

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

  const horizonResetBtn = panel.querySelector(
    '#dev-godrays-horizon-reset',
  ) as HTMLButtonElement | null;
  const onHorizonReset = () => {
    resetGodraysHorizonDev(horizonSettings);
    const enabledCheckbox = panel.querySelector(
      '#dev-godrays-horizon-enabled',
    ) as HTMLInputElement | null;
    if (enabledCheckbox) enabledCheckbox.checked = horizonSettings.enabled;
    syncHorizonUi();
  };
  horizonResetBtn?.addEventListener('click', onHorizonReset);

  syncUi();

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
    diagnoseBtn?.removeEventListener('click', onDiagnose);
    horizonResetBtn?.removeEventListener('click', onHorizonReset);
  };
}
