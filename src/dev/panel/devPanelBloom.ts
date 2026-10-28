// src/dev/panel/devPanelBloom.ts — DEV-only glow/bloom controls
import { VISUAL } from '../../config/visualTuning';
import type { BloomParams, PostFXContext } from '../../rendering/PostFX';
import { bindSpecs, injectRangeRows, mountSection, subsectionHtml, syncSpecs } from '../bindRange';
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

export function initDevPanelBloom(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-glow-bloom',
    title: 'Glow &amp; bloom',
    open: false,
    body: `
      <p class="dev-hint">Glow-only — strength, threshold, sky mask depths. AgX exposure: Time of day → Lighting.</p>
      <div id="dev-bloom-core-rows"></div>
      ${subsectionHtml('Threshold', '<div id="dev-bloom-threshold-rows"></div>')}
      ${subsectionHtml(
        'Sky bloom mask',
        `<div id="dev-bloom-sky-rows"></div>
        <p class="dev-hint">Sky bloom reduce is elevation-driven (<span id="dev-bloom-sky-reduce-live">—</span>; ${B.SKY_REDUCE_LOW} low sun → ${B.SKY_REDUCE_HIGH} high sun). Scene add weight tracks golden hour (<code>VISUAL.bloom.SCENE_WEIGHT_*</code>).</p>`,
      )}
      ${subsectionHtml('Glow meshes', '<div id="dev-bloom-glow-rows"></div>')}
      ${subsectionHtml(
        'Particles',
        `<p class="dev-hint">HDR sparkle sprites. Player count scales with energy (0 → <code>visual/player.ts</code> cap). Guide / energy-orb counts are fixed — full page reload after capacity changes.</p>
        ${subsectionHtml(
          'Guide line',
          `<div id="dev-bloom-particles-guide-rows"></div>
          <div class="dev-actions">
            <button type="button" id="dev-particles-guide-reset">Reset</button>
          </div>`,
        )}
        ${subsectionHtml(
          'Player',
          `<label class="dev-row dev-row-check">
            <span>Enabled</span>
            <input type="checkbox" id="dev-particles-player-enabled" />
          </label>
          <div id="dev-bloom-particles-player-rows"></div>
          <div class="dev-actions">
            <button type="button" id="dev-particles-player-reset">Reset</button>
          </div>`,
        )}
        ${subsectionHtml(
          'Energy orb',
          `<label class="dev-row dev-row-check">
            <span>Enabled</span>
            <input type="checkbox" id="dev-particles-orb-enabled" />
          </label>
          <p class="dev-hint">Idle halo on unabsorbed orbs. Absorb burst pops, then motes assimilate into the player orb.</p>
          <div id="dev-bloom-particles-orb-rows"></div>
          <div class="dev-actions">
            <button type="button" id="dev-particles-orb-reset">Reset</button>
          </div>`,
        )}`,
      )}
      <p class="dev-hint">Orb mesh look (fill / rim HDR): Look → Orb. At 0% energy the player mesh uses <code>orbScaleMin</code> and <code>orbEmissiveMin</code>.</p>
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

  const disposers = bindSpecs(panel, ALL_BLOOM_SPECS, (s, v) => {
    postFX.setBloomParams({ [s.key]: v } as Partial<BloomParams>);
  });
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
