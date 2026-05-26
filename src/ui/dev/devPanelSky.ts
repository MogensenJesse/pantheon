// src/ui/dev/devPanelSky.ts — Preetham sky + aerial fog live tuning (DEV)
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

function injectSkySliders(panel: HTMLDivElement): void {
  const host = panel.querySelector('#dev-sky-globals');
  if (!host) return;
  host.innerHTML = SKY_SPECS.map(
    (s) => `
    <label class="dev-row">
      <span>${s.label}</span>
      <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
      <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
    </label>`,
  ).join('');
}

export function initDevPanelSky(panel: HTMLDivElement, sky: SkySystemContext): void {
  injectSkySliders(panel);

  for (const s of SKY_SPECS) {
    bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
      sky.setSkyParams({ [s.param]: v });
    });
  }
}
