// src/ui/dev/devPanelBloom.ts — DEV-only glow/bloom controls
import { VISUAL } from '../../config/visualTuning';
import type { BloomParams, PostFXContext } from '../../rendering/PostFX';
import { bindRange, injectRangeRows, mountSection, type RangeSpec, syncSpecs } from './bindRange';

const B = VISUAL.bloom;

interface BloomSpec extends RangeSpec {
  key: keyof BloomParams;
}

const CORE_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-strength',
    label: 'Strength',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: B.STRENGTH,
    format: (v) => v.toFixed(2),
    key: 'emissiveStrength',
  },
  {
    id: 'dev-bloom-radius',
    label: 'Radius',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: B.RADIUS,
    format: (v) => v.toFixed(2),
    key: 'radius',
  },
  {
    id: 'dev-bloom-scene-mul',
    label: 'Scene mix',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: B.SCENE_STRENGTH_MUL,
    format: (v) => v.toFixed(2),
    key: 'sceneStrengthMul',
  },
  {
    id: 'dev-bloom-exposure',
    label: 'AgX exposure',
    min: 0.02,
    max: 1.5,
    step: 0.01,
    defaultValue: VISUAL.render.toneMappingExposure,
    format: (v) => v.toFixed(2),
    key: 'exposure',
  },
];

const THRESHOLD_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-threshold',
    label: 'Luma threshold',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: B.SCENE_THRESHOLD,
    format: (v) => v.toFixed(2),
    key: 'sceneThreshold',
  },
  {
    id: 'dev-bloom-smooth-width',
    label: 'Threshold smooth',
    min: 0.001,
    max: 0.2,
    step: 0.005,
    defaultValue: B.SMOOTH_WIDTH,
    format: (v) => v.toFixed(3),
    key: 'smoothWidth',
  },
];

const SKY_MASK_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-sky-depth-start',
    label: 'Sky depth start',
    min: 0.9,
    max: 1,
    step: 0.001,
    defaultValue: B.SKY_DEPTH_START,
    format: (v) => v.toFixed(4),
    key: 'skyDepthStart',
  },
  {
    id: 'dev-bloom-sky-depth-end',
    label: 'Sky depth end',
    min: 0.9,
    max: 1,
    step: 0.001,
    defaultValue: B.SKY_DEPTH_END,
    format: (v) => v.toFixed(4),
    key: 'skyDepthEnd',
  },
  {
    id: 'dev-bloom-sky-luma-start',
    label: 'Keep sun luma start',
    min: 0.4,
    max: 1.4,
    step: 0.01,
    defaultValue: B.SKY_SUN_LUMA_START,
    format: (v) => v.toFixed(2),
    key: 'skySunLumaStart',
  },
  {
    id: 'dev-bloom-sky-luma-end',
    label: 'Keep sun luma end',
    min: 0.4,
    max: 1.6,
    step: 0.01,
    defaultValue: B.SKY_SUN_LUMA_END,
    format: (v) => v.toFixed(2),
    key: 'skySunLumaEnd',
  },
  {
    id: 'dev-bloom-sky-reduce',
    label: 'Sky bloom reduce',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: B.SKY_REDUCE_LOW,
    format: (v) => v.toFixed(2),
    key: 'skyReduce',
  },
];

const GLOW_SPECS: BloomSpec[] = [
  {
    id: 'dev-bloom-hdr-scale',
    label: 'Glow HDR scale',
    min: 0.5,
    max: 12,
    step: 0.05,
    defaultValue: B.HDR_SCALE,
    format: (v) => v.toFixed(2),
    key: 'hdrScale',
  },
];

const ALL_SPECS = [...CORE_SPECS, ...THRESHOLD_SPECS, ...SKY_MASK_SPECS, ...GLOW_SPECS];

function bindBloomSpecs(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  specs: BloomSpec[],
): Array<() => void> {
  const disposers: Array<() => void> = [];
  for (const s of specs) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        postFX.setBloomParams({ [s.key]: v } as Partial<BloomParams>);
      }),
    );
  }
  return disposers;
}

export function initDevPanelBloom(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-glow-bloom',
    title: 'Glow &amp; bloom',
    open: false,
    body: `
      <p class="dev-hint">Scene-output bloom (single RT). Toggle off via Render debug.</p>
      <div id="dev-bloom-core-rows"></div>
      <details class="dev-subsection">
        <summary>Threshold</summary>
        <div class="dev-section-body" id="dev-bloom-threshold-rows"></div>
      </details>
      <details class="dev-subsection">
        <summary>Sky bloom mask</summary>
        <div class="dev-section-body" id="dev-bloom-sky-rows"></div>
        <p class="dev-hint">Sky bloom reduce follows sun elevation (${B.SKY_REDUCE_LOW} low sun → ${B.SKY_REDUCE_HIGH} high sun).</p>
      </details>
      <details class="dev-subsection">
        <summary>Glow meshes</summary>
        <div class="dev-section-body" id="dev-bloom-glow-rows"></div>
      </details>
      <p class="dev-hint">PLAYER_EMISSIVE (${B.PLAYER_EMISSIVE}), STRENGTH_HIGH / RADIUS_HIGH presets — edit visualTuning.ts (reload).</p>
      <div class="dev-actions">
        <button type="button" id="dev-bloom-reset">Reset bloom</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const hosts: Array<[string, BloomSpec[]]> = [
    ['#dev-bloom-core-rows', CORE_SPECS],
    ['#dev-bloom-threshold-rows', THRESHOLD_SPECS],
    ['#dev-bloom-sky-rows', SKY_MASK_SPECS],
    ['#dev-bloom-glow-rows', GLOW_SPECS],
  ];
  for (const [sel, specs] of hosts) {
    const host = panel.querySelector(sel);
    if (host) injectRangeRows(host, specs);
  }

  const syncUi = () => {
    const params = postFX.getBloomParams();
    syncSpecs(panel, ALL_SPECS, (s) => params[(s as BloomSpec).key]);
  };

  const disposers = bindBloomSpecs(panel, postFX, ALL_SPECS);

  const resetBtn = panel.querySelector('#dev-bloom-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetBloomParams();
    syncUi();
  };
  resetBtn?.addEventListener('click', onReset);

  syncUi();

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
