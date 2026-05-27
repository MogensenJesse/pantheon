// src/ui/dev/devPanelSky.ts — mirrors webgpu_sky.html Settings + Clouds GUI
import { SKY_DEFAULTS, SUN_DEFAULTS } from '../../rendering/skyDefaults';
import { applySkyAtmosphereForElevation } from '../../rendering/skyElevationBlend';
import { resetSunDevState, sunDevState } from '../../rendering/sunDevState';
import { sunRevealState } from '../../rendering/WorldReveal';
import type { PostFXContext } from '../../rendering/PostFX';
import type { SkySystemContext } from '../../rendering/SkySystem';
import { bindRange } from './bindRange';

type SkyParamKey = keyof Pick<
  NonNullable<Parameters<SkySystemContext['setSkyParams']>[0]>,
  | 'turbidity'
  | 'rayleigh'
  | 'mieCoefficient'
  | 'mieDirectionalG'
  | 'fogDensity'
  | 'cloudCoverage'
  | 'cloudDensity'
  | 'cloudElevation'
  | 'showSunDisc'
>;

interface RangeSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (v: number) => string;
}

interface SkyRangeSpec extends RangeSpec {
  param: SkyParamKey;
}

const ATMOSPHERE_SPECS: SkyRangeSpec[] = [
  {
    id: 'dev-sky-turbidity',
    label: 'Turbidity',
    min: 0,
    max: 20,
    step: 0.1,
    defaultValue: SKY_DEFAULTS.turbidity,
    format: (v) => v.toFixed(1),
    param: 'turbidity',
  },
  {
    id: 'dev-sky-rayleigh',
    label: 'Rayleigh',
    min: 0,
    max: 4,
    step: 0.001,
    defaultValue: SKY_DEFAULTS.rayleigh,
    format: (v) => v.toFixed(3),
    param: 'rayleigh',
  },
  {
    id: 'dev-sky-mie-coeff',
    label: 'Mie coefficient',
    min: 0,
    max: 0.1,
    step: 0.001,
    defaultValue: SKY_DEFAULTS.mieCoefficient,
    format: (v) => v.toFixed(3),
    param: 'mieCoefficient',
  },
  {
    id: 'dev-sky-mie-g',
    label: 'Mie directional G',
    min: 0,
    max: 1,
    step: 0.001,
    defaultValue: SKY_DEFAULTS.mieDirectionalG,
    format: (v) => v.toFixed(3),
    param: 'mieDirectionalG',
  },
];

const SUN_PLACEMENT_SPECS: RangeSpec[] = [
  {
    id: 'dev-sun-elevation',
    label: 'Elevation',
    min: 0,
    max: 90,
    step: 0.1,
    defaultValue: SUN_DEFAULTS.elevationDeg,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-sun-azimuth',
    label: 'Azimuth',
    min: -180,
    max: 180,
    step: 0.1,
    defaultValue: SUN_DEFAULTS.azimuthDeg,
    format: (v) => v.toFixed(1),
  },
];

const EXPOSURE_SPEC: RangeSpec = {
  id: 'dev-sky-exposure',
  label: 'Exposure',
  min: 0,
  max: 1,
  step: 0.0001,
  defaultValue: SKY_DEFAULTS.exposure,
  format: (v) => v.toFixed(4),
};

const CLOUD_SPECS: SkyRangeSpec[] = [
  {
    id: 'dev-sky-cloud-coverage',
    label: 'Coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SKY_DEFAULTS.cloudCoverage,
    format: (v) => v.toFixed(2),
    param: 'cloudCoverage',
  },
  {
    id: 'dev-sky-cloud-density',
    label: 'Density',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SKY_DEFAULTS.cloudDensity,
    format: (v) => v.toFixed(2),
    param: 'cloudDensity',
  },
  {
    id: 'dev-sky-cloud-elevation',
    label: 'Elevation',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SKY_DEFAULTS.cloudElevation,
    format: (v) => v.toFixed(2),
    param: 'cloudElevation',
  },
];

const FOG_SPEC: SkyRangeSpec = {
  id: 'dev-sky-fog-density',
  label: 'Aerial fog (game)',
  min: 0,
  max: 0.003,
  step: 0.0001,
  defaultValue: SKY_DEFAULTS.fogDensity,
  format: (v) => v.toFixed(4),
  param: 'fogDensity',
};

function sliderRow(s: RangeSpec): string {
  return `
    <label class="dev-row">
      <span>${s.label}</span>
      <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
      <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
    </label>`;
}

function injectSkySliders(panel: HTMLDivElement): void {
  const host = panel.querySelector('#dev-sky-globals');
  if (!host) return;

  host.innerHTML = `
    <p class="dev-hint">Atmosphere turbidity/rayleigh/mie/exposure/cloud coverage are driven each frame by sun elevation (blend 1°→60°). Sliders below are for one-shot overrides only.</p>
    ${ATMOSPHERE_SPECS.map(sliderRow).join('')}
    ${SUN_PLACEMENT_SPECS.map(sliderRow).join('')}
    ${sliderRow(EXPOSURE_SPEC)}
    <label class="dev-row dev-row-check">
      <span>Show sun disc</span>
      <input type="checkbox" id="dev-sky-show-sun-disc" checked />
    </label>
    <details class="dev-subsection" open>
      <summary>Clouds (SkyMesh)</summary>
      <div class="dev-section-body">
        ${CLOUD_SPECS.map(sliderRow).join('')}
      </div>
    </details>
    <p class="dev-hint">Game-only — official example has no terrain fog.</p>
    ${sliderRow(FOG_SPEC)}
    <div class="dev-actions">
      <button type="button" id="dev-sky-reset">Reset sky</button>
    </div>`;
}

function syncSliders(panel: HTMLDivElement, specs: RangeSpec[]): void {
  for (const s of specs) {
    const slider = panel.querySelector(`#${s.id}`) as HTMLInputElement | null;
    const output = panel.querySelector(`#${s.id}-out`) as HTMLOutputElement | null;
    if (!slider) continue;
    slider.value = String(s.defaultValue);
    if (output) output.textContent = s.format(s.defaultValue);
  }
}

export function initDevPanelSky(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
): void {
  injectSkySliders(panel);

  for (const s of ATMOSPHERE_SPECS) {
    bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => sky.setSkyParams({ [s.param]: v }));
  }

  bindRange(panel, 'dev-sun-elevation', 'dev-sun-elevation-out', (v) => v.toFixed(1), (v) => {
    sunDevState.elevationDeg = v;
  });
  bindRange(panel, 'dev-sun-azimuth', 'dev-sun-azimuth-out', (v) => v.toFixed(1), (v) => {
    sunDevState.azimuthDeg = v;
  });
  bindRange(panel, EXPOSURE_SPEC.id, `${EXPOSURE_SPEC.id}-out`, EXPOSURE_SPEC.format, (v) => {
    postFX.setBloomParams({ exposure: v });
  });

  for (const s of CLOUD_SPECS) {
    bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => sky.setSkyParams({ [s.param]: v }));
  }

  bindRange(panel, FOG_SPEC.id, `${FOG_SPEC.id}-out`, FOG_SPEC.format, (v) =>
    sky.setSkyParams({ [FOG_SPEC.param]: v }),
  );

  const showDisc = panel.querySelector('#dev-sky-show-sun-disc') as HTMLInputElement;
  showDisc.checked = SKY_DEFAULTS.showSunDisc > 0;
  showDisc.addEventListener('change', () => {
    sky.setSkyParams({ showSunDisc: showDisc.checked ? 1 : 0 });
  });

  const devSunElevation = () =>
    sunRevealState.elevationDeg + (sunDevState.elevationDeg - SUN_DEFAULTS.elevationDeg);

  applySkyAtmosphereForElevation(sky, postFX, devSunElevation());

  panel.querySelector('#dev-sky-reset')?.addEventListener('click', () => {
    resetSunDevState();
    applySkyAtmosphereForElevation(sky, postFX, devSunElevation());
    showDisc.checked = SKY_DEFAULTS.showSunDisc > 0;
    syncSliders(panel, [...ATMOSPHERE_SPECS, ...SUN_PLACEMENT_SPECS, EXPOSURE_SPEC, ...CLOUD_SPECS, FOG_SPEC]);
  });
}
