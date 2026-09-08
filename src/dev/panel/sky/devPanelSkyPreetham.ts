// src/dev/panel/sky/devPanelSkyPreetham.ts — sun azimuth + SkyMesh clouds (Preetham stops → Time of day)
import { VISUAL } from '../../../config/visualTuning';
import { setDayCycleDevScrubLock } from '../../../core/reveal/DayCycle';
import { sunRevealState } from '../../../core/reveal/sunRevealState';
import type { PostFXContext } from '../../../rendering/PostFX';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import type { SkyRevealAtmosphere } from '../../../rendering/sky/skyDefaults';
import { mergeSkyWithDevOverrides } from '../../../rendering/sky/skyDevOverrides';
import { blendSkyForReveal } from '../../../rendering/sky/skyRevealBlend';
import { resetSunDevState } from '../../../rendering/sunDevState';
import { currentSunAzimuthDeg } from '../../../rendering/sunSpherical';
import {
  bindRange,
  injectRangeRows,
  type RangeSpec,
  rangeRowHtml,
  syncSpecs,
} from '../../bindRange';
import { elevationForPanel, pushDevSkyOverride } from './devPanelSkyShared';

type CloudParamKey = keyof Pick<
  NonNullable<Parameters<SkySystemContext['setSkyParams']>[0]>,
  'cloudCoverage' | 'cloudDensity' | 'cloudElevation' | 'cloudSpeed' | 'showSunDisc'
>;

export interface CloudRangeSpec extends RangeSpec {
  param: CloudParamKey;
}

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
export const CLOUD_SPECS: CloudRangeSpec[] = [
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

export const PREETHAM_SYNC_SPECS: RangeSpec[] = [AZIMUTH_SPEC, ...CLOUD_SPECS];

export function preethamSkyBodyHtml(): string {
  return `
      <p class="dev-hint">Preetham stop look lives under <strong>Time of day</strong>. Mesh clouds: Procedural clouds panel.</p>
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

export function syncPreethamPanel(panel: HTMLDivElement): void {
  const live = mergeSkyWithDevOverrides(blendSkyForReveal(elevationForPanel()));
  syncSpecs(panel, [AZIMUTH_SPEC, ...CLOUD_SPECS], (s) => {
    if (s.id === AZIMUTH_SPEC.id) return currentSunAzimuthDeg();
    const key = (s as CloudRangeSpec).param;
    return live[key as keyof SkyRevealAtmosphere] as number;
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
