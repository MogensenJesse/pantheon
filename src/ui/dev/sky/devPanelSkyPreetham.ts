// src/ui/dev/sky/devPanelSkyPreetham.ts — Preetham atmosphere, sun azimuth, optional SkyMesh clouds
import { VISUAL } from '../../../config/visualTuning';
import { setDayCycleDevScrubLock } from '../../../core/reveal/DayCycle';
import { sunRevealState } from '../../../core/reveal/sunRevealState';
import type { PostFXContext } from '../../../rendering/PostFX';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import type { SkyRevealAtmosphere } from '../../../rendering/sky/skyDefaults';
import { blendSkyForReveal } from '../../../rendering/sky/skyRevealBlend';
import { mergeSkyWithDevOverrides } from '../../../rendering/sky/skyDevOverrides';
import { resetSunDevState } from '../../../rendering/sunDevState';
import { currentSunAzimuthDeg } from '../../../rendering/sunSpherical';
import { bindRange, injectRangeRows, type RangeSpec, rangeRowHtml, syncSpecs } from '../bindRange';
import { pushDevSkyOverride } from './devPanelSkyShared';

type SkyParamKey = keyof Pick<
  NonNullable<Parameters<SkySystemContext['setSkyParams']>[0]>,
  | 'turbidity'
  | 'rayleigh'
  | 'mieCoefficient'
  | 'mieDirectionalG'
  | 'cloudCoverage'
  | 'cloudDensity'
  | 'cloudElevation'
  | 'cloudSpeed'
  | 'showSunDisc'
>;

export interface SkyRangeSpec extends RangeSpec {
  param: SkyParamKey;
}

export const ATMOSPHERE_SPECS: SkyRangeSpec[] = [
  {
    id: 'dev-sky-turbidity',
    label: 'Turbidity',
    min: 0,
    max: 20,
    step: 0.1,
    defaultValue: VISUAL.sky.day.turbidity,
    format: (v) => v.toFixed(1),
    param: 'turbidity',
  },
  {
    id: 'dev-sky-rayleigh',
    label: 'Rayleigh',
    min: 0,
    max: 4,
    step: 0.001,
    defaultValue: VISUAL.sky.day.rayleigh,
    format: (v) => v.toFixed(3),
    param: 'rayleigh',
  },
  {
    id: 'dev-sky-mie-coeff',
    label: 'Mie coefficient',
    min: 0,
    max: 0.1,
    step: 0.001,
    defaultValue: VISUAL.sky.day.mieCoefficient,
    format: (v) => v.toFixed(3),
    param: 'mieCoefficient',
  },
  {
    id: 'dev-sky-mie-g',
    label: 'Mie directional G',
    min: 0,
    max: 1,
    step: 0.001,
    defaultValue: VISUAL.sky.day.mieDirectionalG,
    format: (v) => v.toFixed(3),
    param: 'mieDirectionalG',
  },
];

export const AZIMUTH_SPEC: RangeSpec = {
  id: 'dev-sun-azimuth',
  label: 'Azimuth (scrub)',
  min: -180,
  max: 180,
  step: 0.1,
  defaultValue: VISUAL.sky.cycle.azimuthEast,
  format: (v) => v.toFixed(1),
};

/** DEV Preetham dome clouds (shipped defaults from VISUAL.sky.static; direction follows mesh wind). */
export const CLOUD_SPECS: SkyRangeSpec[] = [
  {
    id: 'dev-sky-cloud-coverage',
    label: 'Coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.sky.static.cloudCoverage,
    format: (v) => v.toFixed(2),
    param: 'cloudCoverage',
  },
  {
    id: 'dev-sky-cloud-density',
    label: 'Density',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.sky.static.cloudDensity,
    format: (v) => v.toFixed(2),
    param: 'cloudDensity',
  },
  {
    id: 'dev-sky-cloud-elevation',
    label: 'Elevation',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.sky.static.cloudElevation,
    format: (v) => v.toFixed(2),
    param: 'cloudElevation',
  },
  {
    id: 'dev-sky-cloud-speed',
    label: 'Scroll speed',
    min: 0,
    max: 0.001,
    step: 0.00001,
    defaultValue: VISUAL.sky.static.cloudSpeed,
    format: (v) => v.toFixed(5),
    param: 'cloudSpeed',
  },
];

export const PREETHAM_SYNC_SPECS: RangeSpec[] = [
  ...ATMOSPHERE_SPECS,
  AZIMUTH_SPEC,
  ...CLOUD_SPECS,
];

export function preethamSkyBodyHtml(): string {
  return `
      <p class="dev-hint">Day atmosphere endpoints below; night endpoints: VISUAL.sky.night (reload). AgX exposure: Sky → Day cycle. Mesh clouds: Procedural clouds panel.</p>
      ${ATMOSPHERE_SPECS.map(rangeRowHtml).join('')}
      ${rangeRowHtml(AZIMUTH_SPEC)}
      <label class="dev-row dev-row-check">
        <span>Show sun disc</span>
        <input type="checkbox" id="dev-sky-show-sun-disc" checked />
      </label>
      <details class="dev-subsection">
        <summary>Clouds (SkyMesh)</summary>
        <p class="dev-hint">Dome layer on by default. Scroll speed is independent; wind direction follows Procedural clouds.</p>
        <div class="dev-section-body" id="dev-sky-cloud-rows"></div>
      </details>`;
}

export function syncPreethamPanel(panel: HTMLDivElement, t: number): void {
  const params = mergeSkyWithDevOverrides(blendSkyForReveal(t));
  syncSpecs(panel, PREETHAM_SYNC_SPECS, (s) => {
    if (s.id === AZIMUTH_SPEC.id) return currentSunAzimuthDeg();
    const key = (s as SkyRangeSpec).param;
    return params[key as keyof SkyRevealAtmosphere] as number;
  });
}

export function bindPreethamSkyPanel(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
): () => void {
  const cloudHost = panel.querySelector('#dev-sky-cloud-rows');
  if (cloudHost) injectRangeRows(cloudHost, CLOUD_SPECS);

  const disposers: Array<() => void> = [];

  for (const s of ATMOSPHERE_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        pushDevSkyOverride(sky, postFX, s.param, v);
      }),
    );
  }

  disposers.push(
    bindRange(panel, AZIMUTH_SPEC.id, `${AZIMUTH_SPEC.id}-out`, AZIMUTH_SPEC.format, (v) => {
      setDayCycleDevScrubLock(true);
      sunRevealState.azimuthDeg = v;
    }),
  );

  for (const s of CLOUD_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        pushDevSkyOverride(sky, postFX, s.param, v);
      }),
    );
  }

  const showDisc = panel.querySelector('#dev-sky-show-sun-disc') as HTMLInputElement;
  showDisc.checked = VISUAL.sky.static.showSunDisc > 0;
  const onDiscChange = () => {
    pushDevSkyOverride(sky, postFX, 'showSunDisc', showDisc.checked ? 1 : 0);
  };
  showDisc.addEventListener('change', onDiscChange);

  return () => {
    for (const fn of disposers) fn();
    showDisc.removeEventListener('change', onDiscChange);
  };
}

export function resetPreethamSunDev(): void {
  resetSunDevState();
  sunRevealState.azimuthDeg = VISUAL.sky.cycle.azimuthEast;
}
