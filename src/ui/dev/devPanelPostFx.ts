// src/ui/dev/devPanelPostFx.ts — DEV post-FX cohesion + FPS counter
import { VISUAL } from '../../config/visualTuning';
import { devSettings, type PostFxCohesionDevSettings } from '../../core/GameState';
import type { PostFXContext } from '../../rendering/PostFX';
import { resetPostFxCohesionDev } from '../../rendering/postfx/postfxCohesionDevDefaults';
import { setFpsCounterEnabled } from '../FpsCounter';
import { bindRange, injectRangeRows, mountSection, type RangeSpec, syncSpecs } from './bindRange';

const C = VISUAL.postfx.cohesion;

interface CohesionSpec extends RangeSpec {
  key: keyof Pick<
    PostFxCohesionDevSettings,
    | 'goldenHourPower'
    | 'bloomSceneWeightAtNoon'
    | 'bloomSceneWeightAtGoldenHour'
    | 'godraysWeightAtNoon'
    | 'godraysWeightAtGoldenHour'
    | 'vignetteDarknessBleed'
  >;
}

const COHESION_SPECS: CohesionSpec[] = [
  {
    id: 'dev-cohesion-golden-power',
    label: 'Golden hour sharpness',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: C.goldenHourPower,
    format: (v) => v.toFixed(2),
    key: 'goldenHourPower',
  },
  {
    id: 'dev-cohesion-bloom-noon',
    label: 'Scene bloom — noon',
    min: 0.5,
    max: 1.5,
    step: 0.02,
    defaultValue: C.bloomSceneWeight.atNoon,
    format: (v) => v.toFixed(2),
    key: 'bloomSceneWeightAtNoon',
  },
  {
    id: 'dev-cohesion-bloom-golden',
    label: 'Scene bloom — golden hour',
    min: 0.5,
    max: 1.5,
    step: 0.02,
    defaultValue: C.bloomSceneWeight.atGoldenHour,
    format: (v) => v.toFixed(2),
    key: 'bloomSceneWeightAtGoldenHour',
  },
  {
    id: 'dev-cohesion-rays-noon',
    label: 'God rays weight — noon',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: C.godraysWeight.atNoon,
    format: (v) => v.toFixed(2),
    key: 'godraysWeightAtNoon',
  },
  {
    id: 'dev-cohesion-rays-golden',
    label: 'God rays weight — golden hour',
    min: 0,
    max: 1.5,
    step: 0.02,
    defaultValue: C.godraysWeight.atGoldenHour,
    format: (v) => v.toFixed(2),
    key: 'godraysWeightAtGoldenHour',
  },
  {
    id: 'dev-cohesion-vignette-bleed',
    label: 'Reveal vignette bleed',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: C.vignetteDarknessBleed,
    format: (v) => v.toFixed(2),
    key: 'vignetteDarknessBleed',
  },
];

export function initDevPanelPostFx(_panel: HTMLDivElement, _postFX: PostFXContext): () => void {
  const body = mountSection(_panel, {
    hostId: 'dev-section-postfx',
    title: 'Post FX',
    open: false,
    body: `
      <p class="dev-hint">Bloom and God rays panels set <strong>base</strong> shader params. Cohesion applies sun-elevation multipliers on top. AgX exposure follows Sky → Day cycle (not Bloom exposure).</p>
      <label class="dev-row dev-row-check">
        <span>Cohesion enabled</span>
        <input type="checkbox" id="dev-cohesion-enabled" />
      </label>
      <div id="dev-cohesion-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-cohesion-reset">Reset cohesion</button>
      </div>
      <label class="dev-row dev-row-check">
        <span>Show FPS</span>
        <input type="checkbox" id="dev-show-fps" />
      </label>
    `,
  });
  if (!body) return () => {};

  const cohesionHost = _panel.querySelector('#dev-cohesion-rows');
  if (cohesionHost) injectRangeRows(cohesionHost, COHESION_SPECS);

  const cohesion = devSettings.postfx.cohesion;
  const enabled = _panel.querySelector('#dev-cohesion-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = cohesion.enabled;

  const disposers: (() => void)[] = [];
  for (const s of COHESION_SPECS) {
    disposers.push(
      bindRange(_panel, s.id, `${s.id}-out`, s.format, (v) => {
        cohesion[s.key] = v;
      }),
    );
  }
  syncSpecs(_panel, COHESION_SPECS, (s) => cohesion[(s as CohesionSpec).key]);

  let onEnabledChange: (() => void) | null = null;
  if (enabled) {
    onEnabledChange = () => {
      cohesion.enabled = enabled.checked;
    };
    enabled.addEventListener('change', onEnabledChange);
  }

  const resetBtn = _panel.querySelector('#dev-cohesion-reset') as HTMLButtonElement | null;
  let onReset: (() => void) | null = null;
  if (resetBtn) {
    onReset = () => {
      resetPostFxCohesionDev(cohesion);
      if (enabled) enabled.checked = cohesion.enabled;
      syncSpecs(_panel, COHESION_SPECS, (s) => cohesion[(s as CohesionSpec).key]);
    };
    resetBtn.addEventListener('click', onReset);
  }

  const showFps = _panel.querySelector('#dev-show-fps') as HTMLInputElement | null;
  let onFpsChange: (() => void) | null = null;
  if (showFps) {
    showFps.checked = devSettings.showFpsCounter;
    onFpsChange = () => setFpsCounterEnabled(showFps.checked);
    showFps.addEventListener('change', onFpsChange);
  }

  return () => {
    for (const d of disposers) d();
    if (enabled && onEnabledChange) enabled.removeEventListener('change', onEnabledChange);
    if (resetBtn && onReset) resetBtn.removeEventListener('click', onReset);
    if (showFps && onFpsChange) showFps.removeEventListener('change', onFpsChange);
  };
}
