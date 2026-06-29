// src/ui/dev/devPanelWater.ts — live WaterMesh look knobs (DEV)
// Writes to devSettings.water; syncPantheonWater reads it every frame, so no
// direct mesh reference is needed (mirrors the cloud-settings pattern).

import { VISUAL } from '../../config/visualTuning';
import { devSettings, type WaterShoreDevSettings } from '../../core/GameState';
import { resetWaterDev } from '../../world/water/waterDevDefaults';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSlider,
  syncSpecs,
} from './bindRange';

const SD = VISUAL.water.shoreDepth;

const WATER_SPECS: RangeSpec[] = [
  {
    id: 'dev-water-size',
    label: 'Ripple scale',
    min: 0.5,
    max: 12,
    step: 0.1,
    defaultValue: VISUAL.water.size,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-water-alpha',
    label: 'Opacity',
    min: 0.4,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.water.alpha,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-water-distortion-day',
    label: 'Distortion (day)',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: VISUAL.water.distortionDay,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-water-distortion-night',
    label: 'Distortion (night)',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: VISUAL.water.distortionNight,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-water-resolution',
    label: 'Reflection scale (max)',
    min: 0.15,
    max: 0.75,
    step: 0.01,
    defaultValue: VISUAL.water.resolutionScale,
    format: (v) => v.toFixed(2),
  },
];

type WaterSliderKey = 'size' | 'alpha' | 'distortionDay' | 'distortionNight' | 'resolutionScale';

const KEY_MAP: Record<string, WaterSliderKey> = {
  'dev-water-size': 'size',
  'dev-water-alpha': 'alpha',
  'dev-water-distortion-day': 'distortionDay',
  'dev-water-distortion-night': 'distortionNight',
  'dev-water-resolution': 'resolutionScale',
};

interface ShoreSpec extends RangeSpec {
  key: keyof Pick<
    WaterShoreDevSettings,
    | 'absorption'
    | 'coastFadeM'
    | 'shallowDepthM'
    | 'refractionDepthM'
    | 'shadowOpacityBoost'
    | 'refractionStrength'
    | 'refractionOffset'
    | 'refractionOpacity'
  >;
}

const SHORE_SPECS: ShoreSpec[] = [
  {
    id: 'dev-shore-absorption',
    label: 'Depth absorption',
    min: 0.05,
    max: 1,
    step: 0.01,
    defaultValue: SD.absorption,
    format: (v) => v.toFixed(2),
    key: 'absorption',
  },
  {
    id: 'dev-shore-coast-fade',
    label: 'Coast fade (m)',
    min: 0.1,
    max: 4,
    step: 0.1,
    defaultValue: SD.coastFadeM,
    format: (v) => v.toFixed(1),
    key: 'coastFadeM',
  },
  {
    id: 'dev-shore-shallow-depth',
    label: 'Shallow tint depth (m)',
    min: 0.5,
    max: 20,
    step: 0.5,
    defaultValue: SD.shallowDepthM,
    format: (v) => v.toFixed(1),
    key: 'shallowDepthM',
  },
  {
    id: 'dev-shore-refraction-depth',
    label: 'Refraction depth (m)',
    min: 0.5,
    max: 20,
    step: 0.5,
    defaultValue: SD.refractionDepthM,
    format: (v) => v.toFixed(1),
    key: 'refractionDepthM',
  },
  {
    id: 'dev-shore-shadow-opacity',
    label: 'Shadow opacity boost',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: SD.shadowOpacityBoost,
    format: (v) => v.toFixed(2),
    key: 'shadowOpacityBoost',
  },
  {
    id: 'dev-shore-refraction-strength',
    label: 'Refraction strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SD.refractionStrength,
    format: (v) => v.toFixed(2),
    key: 'refractionStrength',
  },
  {
    id: 'dev-shore-refraction-offset',
    label: 'Refraction UV offset',
    min: 0,
    max: 5,
    step: 0.1,
    defaultValue: SD.refractionOffset,
    format: (v) => v.toFixed(1),
    key: 'refractionOffset',
  },
  {
    id: 'dev-shore-refraction-opacity',
    label: 'Refraction opacity lock',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: SD.refractionOpacity,
    format: (v) => v.toFixed(2),
    key: 'refractionOpacity',
  },
];

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
}

export function initDevPanelWater(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-water',
    title: 'Water',
    open: false,
    body: `
      <p class="dev-hint">Reflective ocean — reflection scale is the adaptive ceiling inland. Render debug → Hide water drops the reflector pass.</p>
      ${WATER_SPECS.map(
        (s) => `
        <label class="dev-row">
          <span>${s.label}</span>
          <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
          <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
        </label>`,
      ).join('')}
      <details class="dev-subsection" open>
        <summary>Shore depth</summary>
        <div class="dev-subsection-body">
          <p class="dev-hint">Absorption = opacity/murk (deep water + refract darkening). Refraction depth = where screen refraction runs. Opacity lock blocks sharp ghost when refracting.</p>
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
    resetBtn?.removeEventListener('click', onReset);
  };
}
