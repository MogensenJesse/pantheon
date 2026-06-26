// src/ui/dev/devPanelHaze.ts — DEV valley fog / distance haze (scene.fogNode)
import { VISUAL } from '../../config/visualTuning';
import {
  defaultValleyFogParams,
  getValleyFogParams,
  getValleyFogUniforms,
  resetValleyFogParams,
  setValleyFogParams,
  type ValleyFogParams,
} from '../../rendering/atmosphere/valleyFog';
import { bindRange, injectRangeRows, mountSection, type RangeSpec, syncSpecs } from './bindRange';

const H = VISUAL.atmosphere.haze;

interface HazeSpec extends RangeSpec {
  key: keyof Pick<
    ValleyFogParams,
    | 'fogBase'
    | 'fogTop'
    | 'hazeDensity'
    | 'bandStrength'
    | 'noiseScaleA'
    | 'noiseScaleB'
    | 'noiseAmplitude'
    | 'noiseStrength'
  >;
}

const BAND_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-fog-base',
    label: 'Fog base (world Y)',
    min: -40,
    max: 40,
    step: 1,
    defaultValue: H.fogBase,
    format: (v) => v.toFixed(0),
    key: 'fogBase',
  },
  {
    id: 'dev-haze-fog-top',
    label: 'Fog top — night (world Y)',
    min: 0,
    max: 200,
    step: 1,
    defaultValue: H.fogTop,
    format: (v) => v.toFixed(0),
    key: 'fogTop',
  },
  {
    id: 'dev-haze-band-strength',
    label: 'Band strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: H.bandStrength,
    format: (v) => v.toFixed(2),
    key: 'bandStrength',
  },
];

const DISTANCE_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-density',
    label: 'Distance haze density',
    min: 0,
    max: 0.005,
    step: 0.0001,
    defaultValue: H.hazeDensity,
    format: (v) => v.toFixed(4),
    key: 'hazeDensity',
  },
];

const NOISE_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-noise-strength',
    label: 'Wisp strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: H.noiseStrength,
    format: (v) => v.toFixed(2),
    key: 'noiseStrength',
  },
  {
    id: 'dev-haze-noise-amp',
    label: 'Wisp amplitude (m)',
    min: 0,
    max: 60,
    step: 1,
    defaultValue: H.noiseAmplitude,
    format: (v) => v.toFixed(0),
    key: 'noiseAmplitude',
  },
  {
    id: 'dev-haze-noise-scale-a',
    label: 'Noise scale A',
    min: 0.001,
    max: 0.02,
    step: 0.0005,
    defaultValue: H.noiseScaleA,
    format: (v) => v.toFixed(4),
    key: 'noiseScaleA',
  },
  {
    id: 'dev-haze-noise-scale-b',
    label: 'Noise scale B',
    min: 0.001,
    max: 0.03,
    step: 0.0005,
    defaultValue: H.noiseScaleB,
    format: (v) => v.toFixed(4),
    key: 'noiseScaleB',
  },
];

const ALL_SPECS = [...BAND_SPECS, ...DISTANCE_SPECS, ...NOISE_SPECS];

function readParam(key: HazeSpec['key']): number {
  return getValleyFogParams()[key];
}

function applyParam(key: HazeSpec['key'], value: number): void {
  setValleyFogParams({ [key]: value });
}

function syncUi(panel: HTMLDivElement): void {
  syncSpecs(panel, ALL_SPECS, (s) => readParam((s as HazeSpec).key));
  const u = getValleyFogUniforms();
  const p = getValleyFogParams();
  const dayInput = panel.querySelector('#dev-haze-day-color') as HTMLInputElement | null;
  const nightInput = panel.querySelector('#dev-haze-night-color') as HTMLInputElement | null;
  if (dayInput) dayInput.value = p.dayColor;
  if (nightInput) nightInput.value = p.nightColor;
  if (u) {
    u.uFogColor.value.set(p.dayColor);
  }
}

export function initDevPanelHaze(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-haze',
    title: 'Distance haze',
    open: false,
    body: `
      <p class="dev-hint">Valley band + distance fog via <code>scene.fogNode</code> (Three.js webgpu_custom_fog). Sky stays excluded. Toggle off in <strong>Debug</strong>.</p>
      <details class="dev-subsection" open>
        <summary>Height band</summary>
        <div class="dev-section-body" id="dev-haze-band-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Distance dissolve</summary>
        <div class="dev-section-body" id="dev-haze-distance-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Noise wisps</summary>
        <div class="dev-section-body" id="dev-haze-noise-rows"></div>
      </details>
      <label class="dev-row">
        <span>Day haze tint</span>
        <input type="color" id="dev-haze-day-color" value="${H.dayColor}" />
      </label>
      <label class="dev-row">
        <span>Night haze tint</span>
        <input type="color" id="dev-haze-night-color" value="${H.nightColor}" />
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-haze-reset">Reset haze</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-haze-band-rows')!, BAND_SPECS);
  injectRangeRows(body.querySelector('#dev-haze-distance-rows')!, DISTANCE_SPECS);
  injectRangeRows(body.querySelector('#dev-haze-noise-rows')!, NOISE_SPECS);
  syncUi(panel);

  const disposers: Array<() => void> = [];

  for (const s of ALL_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        applyParam(s.key, v);
      }),
    );
  }

  const dayColorInput = panel.querySelector('#dev-haze-day-color') as HTMLInputElement | null;
  const nightColorInput = panel.querySelector('#dev-haze-night-color') as HTMLInputElement | null;

  const onDayColor = () => {
    if (!dayColorInput) return;
    setValleyFogParams({ dayColor: dayColorInput.value });
  };
  const onNightColor = () => {
    if (!nightColorInput) return;
    setValleyFogParams({ nightColor: nightColorInput.value });
  };
  dayColorInput?.addEventListener('input', onDayColor);
  nightColorInput?.addEventListener('input', onNightColor);

  const resetBtn = panel.querySelector('#dev-haze-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetValleyFogParams();
    const d = defaultValleyFogParams();
    if (dayColorInput) dayColorInput.value = d.dayColor;
    if (nightColorInput) nightColorInput.value = d.nightColor;
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    dayColorInput?.removeEventListener('input', onDayColor);
    nightColorInput?.removeEventListener('input', onNightColor);
    resetBtn?.removeEventListener('click', onReset);
  };
}
