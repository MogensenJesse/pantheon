// src/dev/panel/sky/devPanelSkyPreetham.ts - sun azimuth + SkyMesh skydome clouds
import { VISUAL } from '../../../config/visualTuning';
import { setDayCycleDevScrubLock } from '../../../core/reveal/DayCycle';
import { sunRevealState } from '../../../core/reveal/sunRevealState';
import type { PostFXContext } from '../../../rendering/PostFX';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import { SKY_DEFAULTS } from '../../../rendering/sky/skyDefaults';
import { resetSunDevState } from '../../../rendering/sunDevState';
import { currentSunAzimuthDeg } from '../../../rendering/sunSpherical';
import { bindRange, type RangeSpec, rangeRowHtml, syncSpecs } from '../../bindRange';
import { pushDevSkyOverride } from './devPanelSkyShared';

export const AZIMUTH_SPEC: RangeSpec = {
  id: 'dev-sun-azimuth',
  label: 'Azimuth (scrub)',
  min: -180,
  max: 180,
  step: 0.1,
  defaultValue: VISUAL.sky.cycle.azimuthEast,
  format: (v) => v.toFixed(1),
};

const CLOUD = VISUAL.sky.static.skyMeshClouds;

export const SKY_MESH_CLOUD_SPECS: RangeSpec[] = [
  {
    id: 'dev-sky-cloud-coverage',
    label: 'SkyMesh coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLOUD.cloudCoverage,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-sky-cloud-density',
    label: 'SkyMesh density',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLOUD.cloudDensity,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-sky-cloud-elevation',
    label: 'SkyMesh cloud elev',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: CLOUD.cloudElevation,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-sky-cloud-scale',
    label: 'SkyMesh cloud scale',
    min: 0.00005,
    max: 0.001,
    step: 0.00001,
    defaultValue: CLOUD.cloudScale,
    format: (v) => v.toFixed(5),
  },
  {
    id: 'dev-sky-cloud-speed',
    label: 'SkyMesh cloud speed',
    min: 0,
    max: 0.0002,
    step: 0.000001,
    defaultValue: CLOUD.cloudSpeed,
    format: (v) => v.toFixed(6),
  },
];

const CLOUD_PARAM_BY_ID: Record<
  string,
  'cloudCoverage' | 'cloudDensity' | 'cloudElevation' | 'cloudScale' | 'cloudSpeed'
> = {
  'dev-sky-cloud-coverage': 'cloudCoverage',
  'dev-sky-cloud-density': 'cloudDensity',
  'dev-sky-cloud-elevation': 'cloudElevation',
  'dev-sky-cloud-scale': 'cloudScale',
  'dev-sky-cloud-speed': 'cloudSpeed',
};

export const PREETHAM_SYNC_SPECS: RangeSpec[] = [AZIMUTH_SPEC, ...SKY_MESH_CLOUD_SPECS];

export function preethamSkyBodyHtml(): string {
  return `
      <p class="dev-hint">Preetham stop look lives under <strong>Time of day</strong>.</p>
      ${rangeRowHtml(AZIMUTH_SPEC)}
      <label class="dev-row dev-row-check">
        <span>Show sun disc</span>
        <input type="checkbox" id="dev-sky-show-sun-disc" checked />
      </label>
      <details class="dev-subsection"><summary>SkyMesh clouds (skydome)</summary><div class="dev-section-body">
        <p class="dev-hint">r186 procedural dome clouds — separate from world soft MeshCloudSystem.</p>
        ${SKY_MESH_CLOUD_SPECS.map(rangeRowHtml).join('')}
      </div></details>`;
}

export function syncPreethamPanel(panel: HTMLDivElement): void {
  syncSpecs(panel, [AZIMUTH_SPEC], () => currentSunAzimuthDeg());
  syncSpecs(panel, SKY_MESH_CLOUD_SPECS, (s) => {
    const key = CLOUD_PARAM_BY_ID[s.id];
    return SKY_DEFAULTS[key];
  });
}

export function bindPreethamSkyPanel(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(
    bindRange(panel, AZIMUTH_SPEC.id, `${AZIMUTH_SPEC.id}-out`, AZIMUTH_SPEC.format, (v) => {
      setDayCycleDevScrubLock(true);
      sunRevealState.azimuthDeg = v;
    }),
  );

  for (const spec of SKY_MESH_CLOUD_SPECS) {
    const key = CLOUD_PARAM_BY_ID[spec.id];
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        pushDevSkyOverride(sky, postFX, key, v);
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
