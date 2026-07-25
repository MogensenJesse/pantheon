// src/dev/panel/devPanelWater.ts — live WaterMesh look knobs (DEV)
// Writes to devSettings.water; syncPantheonWater reads it every frame, so no
// direct mesh reference is needed (mirrors the cloud-settings pattern).

import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { resetWaterDev } from '../../world/water/config/waterDevDefaults';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  syncSlider,
  syncSpecs,
} from '../bindRange';
import { KEY_MAP, SHORE_SPECS, TIDE_SPECS, WATER_SPECS } from './devPanelWaterSpecs';

const SD = VISUAL.water.shoreDepth;
const TD = VISUAL.water.tide;

function syncUi(panel: HTMLDivElement): void {
  for (const s of WATER_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, devSettings.water[KEY_MAP[s.id]], s.format);
  }
  syncSpecs(panel, SHORE_SPECS, (s) => devSettings.water.shoreDepth[s.key]);
  const shore = devSettings.water.shoreDepth;
  const enabled = panel.querySelector('#dev-shore-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = shore.enabled;
  const shallowDay = panel.querySelector('#dev-shore-shallow-day') as HTMLInputElement | null;
  const shallowNight = panel.querySelector('#dev-shore-shallow-night') as HTMLInputElement | null;
  if (shallowDay) shallowDay.value = shore.shallowColor;
  if (shallowNight) shallowNight.value = shore.shallowColorNight;
  syncSpecs(panel, TIDE_SPECS, (s) => devSettings.water.tide[s.key]);
  const tide = devSettings.water.tide;
  const tideEnabled = panel.querySelector('#dev-tide-enabled') as HTMLInputElement | null;
  if (tideEnabled) tideEnabled.checked = tide.enabled;
  const foamColor = panel.querySelector('#dev-tide-foam-color') as HTMLInputElement | null;
  if (foamColor) foamColor.value = tide.foamColor;
}

export function initDevPanelWater(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-water',
    title: 'Water',
    open: false,
    body: `
      <p class="dev-hint">Reflective ocean — reflection scale lowers RT resolution inland / when looking down; mix stays full. Render debug → Hide water drops the reflector pass.</p>
      ${WATER_SPECS.map(
        (s) => `
        <label class="dev-row">
          <span>${s.label}</span>
          <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
          <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
        </label>`,
      ).join('')}
      <details class="dev-subsection">
        <summary>Shore depth</summary>
        <div class="dev-subsection-body">
          <p class="dev-hint">Absorption = opacity/murk (deep water + refract darkening). Refraction depth = where screen refraction runs. Shore fog bypass keeps shallow water visible through night haze.</p>
          <label class="dev-row dev-row-check">
            <span>Shore depth enabled</span>
            <input type="checkbox" id="dev-shore-enabled" />
          </label>
          <div id="dev-shore-sliders"></div>
          <label class="dev-row">
            <span>Shallow color (day)</span>
            <input type="color" id="dev-shore-shallow-day" value="${SD.shallowColor}" />
          </label>
          <label class="dev-row">
            <span>Shallow color (night)</span>
            <input type="color" id="dev-shore-shallow-night" value="${SD.shallowColorNight}" />
          </label>
        </div>
      </details>
      <details class="dev-subsection">
        <summary>Tide / shore foam</summary>
        <div class="dev-subsection-body">
          <p class="dev-hint">Gentle tidal bob on the water plane + rippling intersection stripe on terrain. Foam fades/tints with night valley fog (linked to Shore fog bypass).</p>
          <label class="dev-row dev-row-check">
            <span>Tide enabled</span>
            <input type="checkbox" id="dev-tide-enabled" />
          </label>
          <div id="dev-tide-sliders"></div>
          <label class="dev-row">
            <span>Foam color</span>
            <input type="color" id="dev-tide-foam-color" value="${TD.foamColor}" />
          </label>
        </div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-water-reset">Reset water</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const shoreSliderHost = panel.querySelector('#dev-shore-sliders');
  if (shoreSliderHost) injectRangeRows(shoreSliderHost, SHORE_SPECS);
  const tideSliderHost = panel.querySelector('#dev-tide-sliders');
  if (tideSliderHost) injectRangeRows(tideSliderHost, TIDE_SPECS);

  syncUi(panel);

  const water = devSettings.water;
  const shore = water.shoreDepth;
  const tide = water.tide;
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
  for (const s of TIDE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        tide[s.key] = v;
      }),
    );
  }
  disposers.push(
    bindCheckbox(
      panel,
      'dev-tide-enabled',
      () => tide.enabled,
      (v) => {
        tide.enabled = v;
      },
    ),
  );

  const shallowDayInput = panel.querySelector('#dev-shore-shallow-day') as HTMLInputElement | null;
  const shallowNightInput = panel.querySelector(
    '#dev-shore-shallow-night',
  ) as HTMLInputElement | null;
  const onShallowDay = () => {
    shore.shallowColor = shallowDayInput?.value ?? shore.shallowColor;
  };
  const onShallowNight = () => {
    shore.shallowColorNight = shallowNightInput?.value ?? shore.shallowColorNight;
  };
  shallowDayInput?.addEventListener('input', onShallowDay);
  shallowNightInput?.addEventListener('input', onShallowNight);

  const foamColorInput = panel.querySelector('#dev-tide-foam-color') as HTMLInputElement | null;
  const onFoamColor = () => {
    tide.foamColor = foamColorInput?.value ?? tide.foamColor;
  };
  foamColorInput?.addEventListener('input', onFoamColor);

  const resetBtn = panel.querySelector('#dev-water-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetWaterDev(devSettings.water);
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    shallowDayInput?.removeEventListener('input', onShallowDay);
    shallowNightInput?.removeEventListener('input', onShallowNight);
    foamColorInput?.removeEventListener('input', onFoamColor);
    resetBtn?.removeEventListener('click', onReset);
  };
}
