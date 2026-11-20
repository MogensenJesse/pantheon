// src/dev/panel/devPanelWater.ts — live WaterMesh look knobs (DEV)
// Writes to devSettings.water; syncPantheonWater reads it every frame, so no
// direct mesh reference is needed for live water look edits.

import { devSettings } from '../../core/settings';
import { resetWaterDev } from '../../world/water/config/waterDevDefaults';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  rangeRowHtml,
  subsectionHtml,
  syncSlider,
  syncSpecs,
} from '../bindRange';
import { KEY_MAP, SHORE_SPECS, WATER_SPECS } from './devPanelWaterSpecs';

function syncUi(panel: HTMLDivElement): void {
  for (const s of WATER_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, devSettings.water[KEY_MAP[s.id]], s.format);
  }
  syncSpecs(panel, SHORE_SPECS, (s) => devSettings.water.shoreDepth[s.key]);
  const shore = devSettings.water.shoreDepth;
  const enabled = panel.querySelector('#dev-shore-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = shore.enabled;
}

export function initDevPanelWater(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-water',
    title: 'Water',
    open: false,
    body: `
      <p class="dev-hint">Reflective ocean — reflection scale lowers RT resolution inland / when looking down; mix stays full. Perf panel → Hide water drops the reflector pass. Per-stop look (color / distortion / shallow) lives under <strong>Time of day</strong>.</p>
      ${WATER_SPECS.map(rangeRowHtml).join('')}
      ${subsectionHtml(
        'Shore depth',
        `<p class="dev-hint">Absorption = opacity/murk (deep water + refract darkening). Refraction depth = where screen refraction runs. Shore fog bypass keeps shallow water visible through night haze.</p>
        <label class="dev-row dev-row-check">
          <span>Shore depth enabled</span>
          <input type="checkbox" id="dev-shore-enabled" />
        </label>
        <div id="dev-shore-sliders"></div>`,
      )}
      <div class="dev-actions">
        <button type="button" id="dev-water-reset">Reset water</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const shoreSliderHost = panel.querySelector('#dev-shore-sliders');
  if (shoreSliderHost) injectRangeRows(shoreSliderHost, SHORE_SPECS);

  syncUi(panel);

  const water = devSettings.water;
  const shore = water.shoreDepth;
  const disposers: Array<() => void> = [];
  for (const s of WATER_SPECS) {
    const key = KEY_MAP[s.id];
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        water[key] = v;
      }),
    );
  }
  for (const s of SHORE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        shore[s.key] = v;
      }),
    );
  }
  disposers.push(
    bindCheckbox(
      panel,
      'dev-shore-enabled',
      () => shore.enabled,
      (v) => {
        shore.enabled = v;
      },
    ),
  );
  const resetBtn = panel.querySelector('#dev-water-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetWaterDev(devSettings.water);
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
