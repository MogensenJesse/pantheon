// src/ui/dev/devPanelWater.ts — live WaterMesh look knobs (DEV)
// Writes to devSettings.water; syncPantheonWater reads it every frame, so no
// direct mesh reference is needed (mirrors the cloud-settings pattern).

import { VISUAL } from '../../config/visualTuning';
import {
  devSettings,
  type WaterShoreDevSettings,
  type WaterTideDevSettings,
} from '../../core/GameState';
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
const TD = VISUAL.water.tide;

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
    | 'fogBypassStrength'
    | 'mapBoundsFadeM'
    | 'openOceanDepthM'
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
  {
    id: 'dev-shore-fog-bypass',
    label: 'Shore fog bypass',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: SD.fogBypassStrength,
    format: (v) => v.toFixed(2),
    key: 'fogBypassStrength',
  },
  {
    id: 'dev-shore-map-bounds-fade',
    label: 'Map edge ocean fade (m)',
    min: 10,
    max: 200,
    step: 5,
    defaultValue: SD.mapBoundsFadeM,
    format: (v) => v.toFixed(0),
    key: 'mapBoundsFadeM',
  },
  {
    id: 'dev-shore-open-ocean-depth',
    label: 'Open ocean depth (m)',
    min: 8,
    max: 80,
    step: 1,
    defaultValue: SD.openOceanDepthM,
    format: (v) => v.toFixed(0),
    key: 'openOceanDepthM',
  },
];

interface TideSpec extends RangeSpec {
  key: keyof Pick<
    WaterTideDevSettings,
    | 'waveSpeed'
    | 'waveAmplitude'
    | 'foamDepth'
    | 'foamRippleAmplitude'
    | 'foamRippleScale'
    | 'foamRippleSpeed'
    | 'foamPatchVariation'
    | 'foamPatchScale'
    | 'foamOpacityMin'
    | 'foamDepthMinRatio'
    | 'foamFogHazeStrength'
    | 'foamFogColorTint'
    | 'foamWaterlineBias'
  >;
}

const TIDE_SPECS: TideSpec[] = [
  {
    id: 'dev-tide-wave-speed',
    label: 'Wave speed',
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: TD.waveSpeed,
    format: (v) => v.toFixed(1),
    key: 'waveSpeed',
  },
  {
    id: 'dev-tide-wave-amplitude',
    label: 'Wave amplitude (m)',
    min: 0,
    max: 0.25,
    step: 0.01,
    defaultValue: TD.waveAmplitude,
    format: (v) => v.toFixed(2),
    key: 'waveAmplitude',
  },
  {
    id: 'dev-tide-foam-depth',
    label: 'Shore stripe depth (m)',
    min: 0.01,
    max: 0.2,
    step: 0.01,
    defaultValue: TD.foamDepth,
    format: (v) => v.toFixed(2),
    key: 'foamDepth',
  },
  {
    id: 'dev-tide-foam-ripple-amp',
    label: 'Foam ripple (m)',
    min: 0,
    max: 0.12,
    step: 0.005,
    defaultValue: TD.foamRippleAmplitude,
    format: (v) => v.toFixed(3),
    key: 'foamRippleAmplitude',
  },
  {
    id: 'dev-tide-foam-ripple-scale',
    label: 'Foam ripple scale',
    min: 0.05,
    max: 0.6,
    step: 0.01,
    defaultValue: TD.foamRippleScale,
    format: (v) => v.toFixed(2),
    key: 'foamRippleScale',
  },
  {
    id: 'dev-tide-foam-ripple-speed',
    label: 'Foam ripple speed',
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: TD.foamRippleSpeed,
    format: (v) => v.toFixed(1),
    key: 'foamRippleSpeed',
  },
  {
    id: 'dev-tide-foam-patch-var',
    label: 'Foam patch variation',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: TD.foamPatchVariation,
    format: (v) => v.toFixed(2),
    key: 'foamPatchVariation',
  },
  {
    id: 'dev-tide-foam-patch-scale',
    label: 'Foam patch scale',
    min: 0.04,
    max: 0.35,
    step: 0.01,
    defaultValue: TD.foamPatchScale,
    format: (v) => v.toFixed(2),
    key: 'foamPatchScale',
  },
  {
    id: 'dev-tide-foam-opacity-min',
    label: 'Thin foam opacity',
    min: 0.05,
    max: 0.85,
    step: 0.02,
    defaultValue: TD.foamOpacityMin,
    format: (v) => v.toFixed(2),
    key: 'foamOpacityMin',
  },
  {
    id: 'dev-tide-foam-depth-min',
    label: 'Thin foam depth ratio',
    min: 0.1,
    max: 0.9,
    step: 0.02,
    defaultValue: TD.foamDepthMinRatio,
    format: (v) => v.toFixed(2),
    key: 'foamDepthMinRatio',
  },
  {
    id: 'dev-tide-foam-fog-haze',
    label: 'Foam night haze fade',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: TD.foamFogHazeStrength,
    format: (v) => v.toFixed(2),
    key: 'foamFogHazeStrength',
  },
  {
    id: 'dev-tide-foam-fog-tint',
    label: 'Foam fog color tint',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: TD.foamFogColorTint,
    format: (v) => v.toFixed(2),
    key: 'foamFogColorTint',
  },
  {
    id: 'dev-tide-foam-waterline-bias',
    label: 'Foam waterline overlap (m)',
    min: -0.12,
    max: 0.06,
    step: 0.005,
    defaultValue: TD.foamWaterlineBias,
    format: (v) => v.toFixed(3),
    key: 'foamWaterlineBias',
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
      <details class="dev-subsection" open>
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
