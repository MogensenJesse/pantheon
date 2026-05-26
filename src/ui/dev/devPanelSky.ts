// src/ui/dev/devPanelSky.ts — Preetham sky + aerial fog + sun tuning (DEV)
import { resetSunDevState, sunDevState } from '../../rendering/sunDevState';
import type { SkySystemContext } from '../../rendering/SkySystem';
import { bindRange } from './bindRange';

interface SkySpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (v: number) => string;
  param: keyof Pick<
    NonNullable<Parameters<SkySystemContext['setSkyParams']>[0]>,
    'turbidity' | 'rayleigh' | 'mieCoefficient' | 'mieDirectionalG' | 'fogDensity'
  >;
}

const SKY_SPECS: SkySpec[] = [
  {
    id: 'dev-sky-turbidity',
    label: 'Turbidity (haze)',
    min: 1,
    max: 20,
    step: 0.5,
    defaultValue: 3,
    format: (v) => v.toFixed(1),
    param: 'turbidity',
  },
  {
    id: 'dev-sky-rayleigh',
    label: 'Rayleigh (blue)',
    min: 0,
    max: 4,
    step: 0.1,
    defaultValue: 3.5,
    format: (v) => v.toFixed(1),
    param: 'rayleigh',
  },
  {
    id: 'dev-sky-mie-coeff',
    label: 'Mie coefficient',
    min: 0.001,
    max: 0.02,
    step: 0.001,
    defaultValue: 0.005,
    format: (v) => v.toFixed(3),
    param: 'mieCoefficient',
  },
  {
    id: 'dev-sky-mie-g',
    label: 'Mie scatter (tight)',
    min: 0.7,
    max: 0.99,
    step: 0.01,
    defaultValue: 0.95,
    format: (v) => v.toFixed(2),
    param: 'mieDirectionalG',
  },
  {
    id: 'dev-sky-fog-density',
    label: 'Aerial fog density',
    min: 0,
    max: 0.003,
    step: 0.0001,
    defaultValue: 0.0008,
    format: (v) => v.toFixed(4),
    param: 'fogDensity',
  },
];

interface SunSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (v: number) => string;
  apply: (v: number, sky: SkySystemContext) => void;
}

const SUN_SPECS: SunSpec[] = [
  {
    id: 'dev-sun-size',
    label: 'Sun size (halo)',
    min: 0.15,
    max: 2,
    step: 0.05,
    defaultValue: 1,
    format: (v) => v.toFixed(2),
    apply: (v, sky) => sky.setSkyParams({ sunSizeMul: v }),
  },
  {
    id: 'dev-sun-sky-azimuth',
    label: 'Sky azimuth °',
    min: -180,
    max: 180,
    step: 1,
    defaultValue: 0,
    format: (v) => v.toFixed(0),
    apply: (v, sky) => sky.setSkyParams({ skyAzimuthOffsetDeg: v }),
  },
  {
    id: 'dev-sun-sky-elevation',
    label: 'Sky elevation °',
    min: -45,
    max: 45,
    step: 1,
    defaultValue: 0,
    format: (v) => `${v.toFixed(0)}°`,
    apply: (v, sky) => sky.setSkyParams({ skyElevationOffsetDeg: v }),
  },
  {
    id: 'dev-sun-light-azimuth',
    label: 'Light azimuth °',
    min: -180,
    max: 180,
    step: 1,
    defaultValue: sunDevState.lightAzimuthDeg,
    format: (v) => v.toFixed(0),
    apply: (v) => {
      sunDevState.lightAzimuthDeg = v;
    },
  },
  {
    id: 'dev-sun-light-dist',
    label: 'Light distance',
    min: 20,
    max: 120,
    step: 1,
    defaultValue: sunDevState.lightHorizontalDist,
    format: (v) => v.toFixed(0),
    apply: (v) => {
      sunDevState.lightHorizontalDist = v;
    },
  },
  {
    id: 'dev-sun-light-elevation',
    label: 'Light elev. extra',
    min: -40,
    max: 40,
    step: 1,
    defaultValue: 0,
    format: (v) => v.toFixed(0),
    apply: (v) => {
      sunDevState.lightElevationExtra = v;
    },
  },
];

function injectSkySliders(panel: HTMLDivElement): void {
  const host = panel.querySelector('#dev-sky-globals');
  if (!host) return;
  const atmosphereHtml = SKY_SPECS.map(
    (s) => `
    <label class="dev-row">
      <span>${s.label}</span>
      <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
      <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
    </label>`,
  ).join('');

  const sunHtml = `
    <p class="dev-hint">Sun disc — visual offsets do not move shadows. Light sliders move sun + shadows.</p>
    ${SUN_SPECS.map(
      (s) => `
    <label class="dev-row">
      <span>${s.label}</span>
      <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
      <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
    </label>`,
    ).join('')}
    <div class="dev-actions">
      <button type="button" id="dev-sun-reset">Reset sun</button>
    </div>`;

  host.innerHTML = atmosphereHtml + sunHtml;
}

export function initDevPanelSky(panel: HTMLDivElement, sky: SkySystemContext): void {
  injectSkySliders(panel);

  for (const s of SKY_SPECS) {
    bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
      sky.setSkyParams({ [s.param]: v });
    });
  }

  for (const s of SUN_SPECS) {
    bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
      s.apply(v, sky);
    });
  }

  panel.querySelector('#dev-sun-reset')?.addEventListener('click', () => {
    resetSunDevState();
    sky.setSkyParams({
      sunSizeMul: 1,
      skyAzimuthOffsetDeg: 0,
      skyElevationOffsetDeg: 0,
      mieCoefficient: 0.005,
    });
    for (const s of SUN_SPECS) {
      const slider = panel.querySelector(`#${s.id}`) as HTMLInputElement | null;
      const output = panel.querySelector(`#${s.id}-out`) as HTMLOutputElement | null;
      if (!slider) continue;
      slider.value = String(s.defaultValue);
      if (output) output.textContent = s.format(s.defaultValue);
    }
    // Refresh light azimuth / dist defaults after resetSunDevState().
    const azSlider = panel.querySelector('#dev-sun-light-azimuth') as HTMLInputElement | null;
    const distSlider = panel.querySelector('#dev-sun-light-dist') as HTMLInputElement | null;
    if (azSlider) azSlider.value = String(sunDevState.lightAzimuthDeg);
    if (distSlider) distSlider.value = String(sunDevState.lightHorizontalDist);
  });
}
