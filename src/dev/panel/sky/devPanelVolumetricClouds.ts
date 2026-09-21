// src/dev/panel/sky/devPanelVolumetricClouds.ts — live webgpu-clouds knobs (DEV)
import { VISUAL } from '../../../config/visualTuning';
import type { PostFXContext } from '../../../rendering/PostFX';
import type {
  VolumetricCloudTuning,
  VolumetricQualityPreset,
} from '../../../rendering/clouds/volumetricCloudSystem';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  syncSpecs,
  type RangeSpec,
} from '../../bindRange';

const VOL = VISUAL.clouds.volumetric;

interface VolSpec extends RangeSpec {
  key: keyof VolumetricCloudTuning;
}

const GLOBAL_SPECS: VolSpec[] = [
  {
    id: 'dev-volcloud-coverage',
    label: 'Coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VOL?.coverage ?? 0.38,
    format: (v) => v.toFixed(2),
    key: 'coverage',
  },
  {
    id: 'dev-volcloud-res',
    label: 'Resolution scale',
    min: 0.25,
    max: 1,
    step: 0.05,
    defaultValue: 1,
    format: (v) => v.toFixed(2),
    key: 'resolutionScale',
  },
  {
    id: 'dev-volcloud-temporal-alpha',
    label: 'Temporal alpha',
    min: 0.01,
    max: 1,
    step: 0.01,
    defaultValue: 0.1,
    format: (v) => v.toFixed(2),
    key: 'temporalAlpha',
  },
];

const LOOK_SPECS: VolSpec[] = [
  {
    id: 'dev-volcloud-scatter',
    label: 'Scattering',
    min: 0,
    max: 4,
    step: 0.05,
    defaultValue: 1,
    format: (v) => v.toFixed(2),
    key: 'scatteringCoefficient',
  },
  {
    id: 'dev-volcloud-absorb',
    label: 'Absorption',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: 0,
    format: (v) => v.toFixed(2),
    key: 'absorptionCoefficient',
  },
  {
    id: 'dev-volcloud-powder',
    label: 'Powder scale',
    min: 0,
    max: 4,
    step: 0.05,
    defaultValue: 1,
    format: (v) => v.toFixed(2),
    key: 'powderScale',
  },
  {
    id: 'dev-volcloud-powder-exp',
    label: 'Powder exponent',
    min: 0.1,
    max: 4,
    step: 0.05,
    defaultValue: 1,
    format: (v) => v.toFixed(2),
    key: 'powderExponent',
  },
];

const WEATHER_SPECS: VolSpec[] = [
  {
    id: 'dev-volcloud-wx',
    label: 'Weather offset X',
    min: -2,
    max: 2,
    step: 0.01,
    defaultValue: 0,
    format: (v) => v.toFixed(2),
    key: 'weatherOffsetX',
  },
  {
    id: 'dev-volcloud-wy',
    label: 'Weather offset Y',
    min: -2,
    max: 2,
    step: 0.01,
    defaultValue: 0,
    format: (v) => v.toFixed(2),
    key: 'weatherOffsetY',
  },
  {
    id: 'dev-volcloud-wvx',
    label: 'Weather vel X',
    min: -0.05,
    max: 0.05,
    step: 0.001,
    defaultValue: 0.002,
    format: (v) => v.toFixed(3),
    key: 'weatherVelocityX',
  },
  {
    id: 'dev-volcloud-wvy',
    label: 'Weather vel Y',
    min: -0.05,
    max: 0.05,
    step: 0.001,
    defaultValue: 0,
    format: (v) => v.toFixed(3),
    key: 'weatherVelocityY',
  },
];

function layerSpecs(i: 0 | 1 | 2): VolSpec[] {
  const defaults = VOL?.layers[i];
  return [
    {
      id: `dev-volcloud-l${i}-alt`,
      label: `L${i} altitude (m)`,
      min: 0,
      max: i === 2 ? 16000 : 12000,
      step: i === 2 ? 50 : 10,
      defaultValue: defaults?.altitude ?? (i === 0 ? 750 : i === 1 ? 1000 : 7500),
      format: (v) => `${Math.round(v)}`,
      key: `layer${i}Altitude` as keyof VolumetricCloudTuning,
    },
    {
      id: `dev-volcloud-l${i}-h`,
      label: `L${i} height (m)`,
      min: 10,
      max: 4000,
      step: 10,
      defaultValue: defaults?.height ?? (i === 0 ? 650 : i === 1 ? 1200 : 500),
      format: (v) => `${Math.round(v)}`,
      key: `layer${i}Height` as keyof VolumetricCloudTuning,
    },
    {
      id: `dev-volcloud-l${i}-d`,
      label: `L${i} density`,
      min: 0,
      max: i === 2 ? 0.2 : 2,
      step: i === 2 ? 0.001 : 0.01,
      defaultValue: defaults?.densityScale ?? (i === 2 ? 0.003 : 0.2),
      format: (v) => (i === 2 ? v.toFixed(3) : v.toFixed(2)),
      key: `layer${i}Density` as keyof VolumetricCloudTuning,
    },
    {
      id: `dev-volcloud-l${i}-shape`,
      label: `L${i} shape`,
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: 1,
      format: (v) => v.toFixed(2),
      key: `layer${i}Shape` as keyof VolumetricCloudTuning,
    },
    {
      id: `dev-volcloud-l${i}-detail`,
      label: `L${i} shape detail`,
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: 1,
      format: (v) => v.toFixed(2),
      key: `layer${i}ShapeDetail` as keyof VolumetricCloudTuning,
    },
  ];
}

const LAYER_SPECS: VolSpec[] = [...layerSpecs(0), ...layerSpecs(1), ...layerSpecs(2)];

const ALL_RANGE_SPECS: VolSpec[] = [
  ...GLOBAL_SPECS,
  ...LOOK_SPECS,
  ...WEATHER_SPECS,
  ...LAYER_SPECS,
];

const QUALITY_OPTIONS: VolumetricQualityPreset[] = ['low', 'medium', 'high', 'ultra'];

const BOOL_KEYS = [
  'shadowEnabled',
  'temporalUpscale',
  'temporalHistoryEnabled',
  'layer0Shadow',
  'layer1Shadow',
  'layer2Shadow',
] as const satisfies ReadonlyArray<keyof VolumetricCloudTuning>;

function syncUi(panel: HTMLDivElement, postFX: PostFXContext): void {
  const get = postFX.getVolumetricCloudTuning;
  if (!get) return;
  const tuning = get();
  syncSpecs(panel, ALL_RANGE_SPECS, (s) => {
    const v = tuning[s.key];
    return typeof v === 'number' ? v : 0;
  });
  for (const key of BOOL_KEYS) {
    const el = panel.querySelector(`#dev-volcloud-${key}`) as HTMLInputElement | null;
    if (el) el.checked = Boolean(tuning[key]);
  }
  const quality = panel.querySelector('#dev-volcloud-quality') as HTMLSelectElement | null;
  if (quality) quality.value = tuning.qualityPreset;
}

export function initDevPanelVolumetricClouds(
  panel: HTMLDivElement,
  postFX: PostFXContext,
): () => void {
  if (!import.meta.env.DEV) return () => {};
  if (!postFX.getVolumetricCloudTuning || !postFX.setVolumetricCloudTuning) {
    return () => {};
  }

  const body = mountSection(panel, {
    hostId: 'dev-section-volumetric-clouds',
    title: 'Volumetric clouds',
    open: true,
    body: `
      <p class="dev-hint">Live <code>webgpu-clouds</code> knobs. Altitudes are package-scale metres. Mesh procedural clouds stay in the section above.</p>
      <label class="dev-row">
        <span>Quality</span>
        <select id="dev-volcloud-quality">
          ${QUALITY_OPTIONS.map((q) => `<option value="${q}">${q}</option>`).join('')}
        </select>
      </label>
      <label class="dev-row dev-row-check">
        <span>Cloud shadows</span>
        <input type="checkbox" id="dev-volcloud-shadowEnabled" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Temporal upscale</span>
        <input type="checkbox" id="dev-volcloud-temporalUpscale" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Temporal history</span>
        <input type="checkbox" id="dev-volcloud-temporalHistoryEnabled" />
      </label>
      <div id="dev-volcloud-global-rows"></div>
      <details class="dev-subsection" open>
        <summary>Look (scatter / powder)</summary>
        <div class="dev-section-body" id="dev-volcloud-look-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Weather scroll</summary>
        <div class="dev-section-body" id="dev-volcloud-weather-rows"></div>
      </details>
      <details class="dev-subsection" open>
        <summary>Layers (r / g / b)</summary>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check"><span>L0 shadow</span><input type="checkbox" id="dev-volcloud-layer0Shadow" /></label>
          <label class="dev-row dev-row-check"><span>L1 shadow</span><input type="checkbox" id="dev-volcloud-layer1Shadow" /></label>
          <label class="dev-row dev-row-check"><span>L2 shadow</span><input type="checkbox" id="dev-volcloud-layer2Shadow" /></label>
          <div id="dev-volcloud-layer-rows"></div>
        </div>
      </details>
      <div class="dev-actions">
        <button type="button" id="dev-volcloud-reset">Reset volumetric</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectRangeRows(body.querySelector('#dev-volcloud-global-rows')!, GLOBAL_SPECS);
  injectRangeRows(body.querySelector('#dev-volcloud-look-rows')!, LOOK_SPECS);
  injectRangeRows(body.querySelector('#dev-volcloud-weather-rows')!, WEATHER_SPECS);
  injectRangeRows(body.querySelector('#dev-volcloud-layer-rows')!, LAYER_SPECS);
  syncUi(panel, postFX);

  const disposers: Array<() => void> = [];
  const set = postFX.setVolumetricCloudTuning!;

  for (const key of BOOL_KEYS) {
    disposers.push(
      bindCheckbox(
        panel,
        `dev-volcloud-${key}`,
        () => Boolean(postFX.getVolumetricCloudTuning!()[key]),
        (v) => set({ [key]: v } as Partial<VolumetricCloudTuning>),
      ),
    );
  }

  const quality = panel.querySelector('#dev-volcloud-quality') as HTMLSelectElement | null;
  const onQuality = () => {
    if (!quality) return;
    set({ qualityPreset: quality.value as VolumetricQualityPreset });
  };
  quality?.addEventListener('change', onQuality);
  disposers.push(() => quality?.removeEventListener('change', onQuality));

  for (const spec of ALL_RANGE_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        set({ [spec.key]: v } as Partial<VolumetricCloudTuning>);
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-volcloud-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetVolumetricCloudTuning?.();
    syncUi(panel, postFX);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
