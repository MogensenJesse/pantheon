// src/ui/dev/devPanelHaze.ts — DEV valley fog / distance haze (scene.fogNode)
import { VISUAL } from '../../config/visualTuning';
import {
  defaultValleyFogParams,
  getValleyFogParams,
  getValleyFogUniforms,
  resetValleyFogParams,
  setValleyFogParams,
} from '../../rendering/atmosphere/valleyFog';
import { bindRange, injectRangeRows, mountSection, syncSpecs } from './bindRange';
import {
  ALL_HAZE_SPECS,
  BAND_SPECS,
  DISTANCE_SPECS,
  type HazeSpec,
  NOISE_SPECS,
} from './devPanelHazeSpecs';

const H = VISUAL.atmosphere.haze;

function readParam(key: HazeSpec['key']): number {
  return getValleyFogParams()[key];
}

function applyParam(key: HazeSpec['key'], value: number): void {
  setValleyFogParams({ [key]: value });
}

function syncUi(panel: HTMLDivElement): void {
  syncSpecs(panel, ALL_HAZE_SPECS, (s) => readParam(s.key));
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
      <details class="dev-subsection">
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

  for (const s of ALL_HAZE_SPECS) {
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
