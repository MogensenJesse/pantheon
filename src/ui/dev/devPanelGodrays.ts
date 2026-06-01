// src/ui/dev/devPanelGodrays.ts — DEV light shafts / god rays (PostFX)
import { VISUAL } from '../../config/visualTuning';
import type { GodraysParams, PostFXContext } from '../../rendering/PostFX';
import { bindRange, injectRangeRows, mountSection, type RangeSpec, syncSpecs } from './bindRange';

const G = VISUAL.godrays;

interface GodraysSpec extends RangeSpec {
  key: keyof GodraysParams;
}

const STRENGTH_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-intensity-mul',
    label: 'Intensity mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: G.INTENSITY_MUL,
    format: (v) => v.toFixed(2),
    key: 'intensityMul',
  },
  {
    id: 'dev-godrays-weight-min',
    label: 'Blend min',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.WEIGHT_MIN,
    format: (v) => v.toFixed(2),
    key: 'weightMin',
  },
  {
    id: 'dev-godrays-weight-max',
    label: 'Blend max',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.WEIGHT_MAX,
    format: (v) => v.toFixed(2),
    key: 'weightMax',
  },
];

const DENSITY_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-density',
    label: 'Density base',
    min: 0,
    max: 4,
    step: 0.05,
    defaultValue: G.DENSITY_BASE,
    format: (v) => v.toFixed(2),
    key: 'densityBase',
  },
  {
    id: 'dev-godrays-max-density',
    label: 'Max density',
    min: 0,
    max: 4,
    step: 0.05,
    defaultValue: G.MAX_DENSITY_BASE,
    format: (v) => v.toFixed(2),
    key: 'maxDensityBase',
  },
];

const TINT_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-tint-r',
    label: 'Tint R',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.TINT_R,
    format: (v) => v.toFixed(2),
    key: 'tintR',
  },
  {
    id: 'dev-godrays-tint-g',
    label: 'Tint G',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.TINT_G,
    format: (v) => v.toFixed(2),
    key: 'tintG',
  },
  {
    id: 'dev-godrays-tint-b',
    label: 'Tint B',
    min: 0.5,
    max: 1.5,
    step: 0.01,
    defaultValue: G.TINT_B,
    format: (v) => v.toFixed(2),
    key: 'tintB',
  },
];

const EDGE_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-edge-radius',
    label: 'Edge radius',
    min: 0,
    max: 8,
    step: 1,
    defaultValue: G.EDGE_RADIUS,
    format: (v) => String(Math.round(v)),
    key: 'edgeRadius',
  },
  {
    id: 'dev-godrays-edge-strength',
    label: 'Edge strength',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: G.EDGE_STRENGTH,
    format: (v) => v.toFixed(1),
    key: 'edgeStrength',
  },
];

const MASK_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-sky-luma-start',
    label: 'Sky luma start',
    min: 0.4,
    max: 1.2,
    step: 0.01,
    defaultValue: G.SKY_LUMA_START,
    format: (v) => v.toFixed(2),
    key: 'skyLumaStart',
  },
  {
    id: 'dev-godrays-sky-luma-end',
    label: 'Sky luma end',
    min: 0.4,
    max: 1.4,
    step: 0.01,
    defaultValue: G.SKY_LUMA_END,
    format: (v) => v.toFixed(2),
    key: 'skyLumaEnd',
  },
  {
    id: 'dev-godrays-sun-facing-min',
    label: 'Sun facing min',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    defaultValue: G.SUN_FACING_MIN,
    format: (v) => v.toFixed(2),
    key: 'sunFacingMin',
  },
  {
    id: 'dev-godrays-sun-facing-max',
    label: 'Sun facing max',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.SUN_FACING_MAX,
    format: (v) => v.toFixed(2),
    key: 'sunFacingMax',
  },
];

const SUN_SPECS: GodraysSpec[] = [
  {
    id: 'dev-godrays-sun-int-ref',
    label: 'Sun intensity ref',
    min: 0.2,
    max: 4,
    step: 0.05,
    defaultValue: G.SUN_INTENSITY_REF,
    format: (v) => v.toFixed(2),
    key: 'sunIntensityRef',
  },
  {
    id: 'dev-godrays-elev-falloff',
    label: 'Elevation falloff',
    min: 10,
    max: 120,
    step: 1,
    defaultValue: G.ELEV_RAY_FALLOFF,
    format: (v) => String(Math.round(v)),
    key: 'elevRayFalloff',
  },
  {
    id: 'dev-godrays-elev-min',
    label: 'Elev factor min',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: G.ELEV_FACTOR_MIN,
    format: (v) => v.toFixed(2),
    key: 'elevFactorMin',
  },
  {
    id: 'dev-godrays-elev-max',
    label: 'Elev factor max',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: G.ELEV_FACTOR_MAX,
    format: (v) => v.toFixed(2),
    key: 'elevFactorMax',
  },
];

const ALL_SPECS = [
  ...STRENGTH_SPECS,
  ...DENSITY_SPECS,
  ...TINT_SPECS,
  ...EDGE_SPECS,
  ...MASK_SPECS,
  ...SUN_SPECS,
];

function bindGodraysSpecs(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  specs: GodraysSpec[],
): Array<() => void> {
  const disposers: Array<() => void> = [];
  for (const s of specs) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        postFX.setGodraysParams({ [s.key]: v } as Partial<GodraysParams>);
      }),
    );
  }
  return disposers;
}

export function initDevPanelGodrays(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-godrays',
    title: 'Light shafts / god rays',
    open: false,
    body: `
      <p class="dev-hint">Volumetric rays follow sun intensity and elevation. Disable via Render debug.</p>
      <div id="dev-godrays-strength-rows"></div>
      <div id="dev-godrays-density-rows"></div>
      <div id="dev-godrays-tint-rows"></div>
      <div id="dev-godrays-edge-rows"></div>
      <details class="dev-subsection">
        <summary>Sky mask</summary>
        <div class="dev-section-body" id="dev-godrays-mask-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Sun elevation scaling</summary>
        <div class="dev-section-body" id="dev-godrays-sun-rows"></div>
      </details>
      <p class="dev-hint">Blur sigma (${G.BLUR_SIGMA} / ${G.BLUR_SIGMA_COLOR}) is fixed until reload — edit visualTuning.ts.</p>
      <div class="dev-actions">
        <button type="button" id="dev-godrays-reset">Reset god rays</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const hosts: Array<[string, GodraysSpec[]]> = [
    ['#dev-godrays-strength-rows', STRENGTH_SPECS],
    ['#dev-godrays-density-rows', DENSITY_SPECS],
    ['#dev-godrays-tint-rows', TINT_SPECS],
    ['#dev-godrays-edge-rows', EDGE_SPECS],
    ['#dev-godrays-mask-rows', MASK_SPECS],
    ['#dev-godrays-sun-rows', SUN_SPECS],
  ];
  for (const [sel, specs] of hosts) {
    const host = panel.querySelector(sel);
    if (host) injectRangeRows(host, specs);
  }

  const syncUi = () => {
    const params = postFX.getGodraysParams();
    syncSpecs(panel, ALL_SPECS, (s) => params[(s as GodraysSpec).key]);
  };

  const disposers = bindGodraysSpecs(panel, postFX, ALL_SPECS);

  const resetBtn = panel.querySelector('#dev-godrays-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetGodraysParams();
    syncUi();
  };
  resetBtn?.addEventListener('click', onReset);

  syncUi();

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
