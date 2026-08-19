// src/dev/panel/devPanelBloom.ts — DEV-only glow/bloom controls
import { VISUAL } from '../../config/visualTuning';
import type { BloomParams, PostFXContext } from '../../rendering/PostFX';
import { bindRange, injectRangeRows, mountSection, syncSpecs } from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';
import {
  ALL_BLOOM_SPECS,
  type BloomSpec,
  CORE_SPECS,
  GLOW_SPECS,
  SKY_MASK_SPECS,
  THRESHOLD_SPECS,
} from './devPanelBloomSpecs';
import { initDevPanelParticles } from './devPanelParticles';

const B = VISUAL.bloom;

function bindBloomSpecs(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  specs: BloomSpec[],
): Array<() => void> {
  const disposers: Array<() => void> = [];
  for (const s of specs) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        postFX.setBloomParams({ [s.key]: v } as Partial<BloomParams>);
      }),
    );
  }
  return disposers;
}

export function initDevPanelBloom(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-glow-bloom',
    title: 'Glow &amp; bloom',
    open: false,
    body: `
      <p class="dev-hint">Glow-only — strength, threshold, sky mask depths. AgX exposure: Sky → Day cycle.</p>
      <div id="dev-bloom-core-rows"></div>
      <details class="dev-subsection">
        <summary>Threshold</summary>
        <div class="dev-section-body" id="dev-bloom-threshold-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Sky bloom mask</summary>
        <div class="dev-section-body" id="dev-bloom-sky-rows"></div>
        <p class="dev-hint">Sky bloom reduce is elevation-driven (<span id="dev-bloom-sky-reduce-live">—</span>; ${B.SKY_REDUCE_LOW} low sun → ${B.SKY_REDUCE_HIGH} high sun). Tune via cohesion or VISUAL.bloom.</p>
      </details>
      <details class="dev-subsection">
        <summary>Glow meshes</summary>
        <div class="dev-section-body" id="dev-bloom-glow-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Particles</summary>
        <div class="dev-section-body">
          <p class="dev-hint">HDR sparkle sprites. Player count scales with energy (0 → <code>visual/player.ts</code> cap). Guide count is fixed — full page reload after capacity changes.</p>
          <details class="dev-subsection">
            <summary>Guide line</summary>
            <div class="dev-section-body">
              <div id="dev-bloom-particles-guide-rows"></div>
              <div class="dev-actions">
                <button type="button" id="dev-particles-guide-reset">Reset</button>
              </div>
            </div>
          </details>
          <details class="dev-subsection">
            <summary>Player</summary>
            <div class="dev-section-body">
              <label class="dev-row dev-row-check">
                <span>Enabled</span>
                <input type="checkbox" id="dev-particles-player-enabled" />
              </label>
              <div id="dev-bloom-particles-player-rows"></div>
              <div class="dev-actions">
                <button type="button" id="dev-particles-player-reset">Reset</button>
              </div>
            </div>
          </details>
        </div>
      </details>
      <p class="dev-hint">PLAYER_EMISSIVE (${B.PLAYER_EMISSIVE}) — edit visualTuning.ts (reload).</p>
      <div class="dev-actions">
        <button type="button" id="dev-bloom-reset">Reset bloom</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const hosts: Array<[string, BloomSpec[]]> = [
    ['#dev-bloom-core-rows', CORE_SPECS],
    ['#dev-bloom-threshold-rows', THRESHOLD_SPECS],
    ['#dev-bloom-sky-rows', SKY_MASK_SPECS],
    ['#dev-bloom-glow-rows', GLOW_SPECS],
  ];
  for (const [sel, specs] of hosts) {
    const host = panel.querySelector(sel);
    if (host) injectRangeRows(host, specs);
  }

  const skyReduceLive = panel.querySelector('#dev-bloom-sky-reduce-live');

  const syncSkyReduceLive = () => {
    if (skyReduceLive) {
      skyReduceLive.textContent = postFX.getBloomParams().skyReduce.toFixed(2);
    }
  };

  const unregisterLateTick = registerDevPanelLateTick(syncSkyReduceLive);

  const syncUi = () => {
    const params = postFX.getBloomParams();
    syncSpecs(panel, ALL_BLOOM_SPECS, (s) => params[s.key]);
    syncSkyReduceLive();
  };

  const disposers = bindBloomSpecs(panel, postFX, ALL_BLOOM_SPECS);
  disposers.push(initDevPanelParticles(panel));

  const resetBtn = panel.querySelector('#dev-bloom-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetBloomParams();
    syncUi();
  };
  resetBtn?.addEventListener('click', onReset);

  syncUi();

  return () => {
    unregisterLateTick();
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
