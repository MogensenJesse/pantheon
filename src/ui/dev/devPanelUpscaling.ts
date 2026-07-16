// src/ui/dev/devPanelUpscaling.ts — play-mode AA method + FSR1 / resolution scale (PostFX)
import {
  type AaMethod,
  type UpscalingMethod,
  type UpscalingSettings,
  VISUAL,
} from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import { bindCheckbox, bindRange, mountSection } from './bindRange';

const DEFAULTS: UpscalingSettings = { ...VISUAL.render.upscaling };
const DEFAULT_AA: AaMethod = VISUAL.render.aaMethod;

const formatScale = (v: number) => v.toFixed(2);
const formatSharpness = (v: number) => v.toFixed(2);

function syncUpscalingUi(panel: HTMLDivElement, settings: UpscalingSettings, aa: AaMethod): void {
  const enabled = panel.querySelector('#dev-upscale-enabled') as HTMLInputElement | null;
  const scale = panel.querySelector('#dev-upscale-scale') as HTMLInputElement | null;
  const scaleOut = panel.querySelector('#dev-upscale-scale-out') as HTMLOutputElement | null;
  const method = panel.querySelector('#dev-upscale-method') as HTMLSelectElement | null;
  const sharpness = panel.querySelector('#dev-upscale-sharpness') as HTMLInputElement | null;
  const sharpnessOut = panel.querySelector(
    '#dev-upscale-sharpness-out',
  ) as HTMLOutputElement | null;
  const denoise = panel.querySelector('#dev-upscale-denoise') as HTMLInputElement | null;
  const aaSelect = panel.querySelector('#dev-aa-method') as HTMLSelectElement | null;

  if (enabled) enabled.checked = settings.enabled;
  if (scale) scale.value = String(settings.resolutionScale);
  if (scaleOut) scaleOut.textContent = formatScale(settings.resolutionScale);
  if (method) method.value = settings.method;
  if (sharpness) sharpness.value = String(settings.sharpness);
  if (sharpnessOut) sharpnessOut.textContent = formatSharpness(settings.sharpness);
  if (denoise) denoise.checked = settings.denoise;
  if (aaSelect) aaSelect.value = aa;
}

function parseMethod(value: string): UpscalingMethod {
  return value === 'bilinear' ? 'bilinear' : 'fsr1';
}

function parseAaMethod(value: string): AaMethod {
  if (value === 'fxaa') return 'fxaa';
  if (value === 'off') return 'off';
  return 'smaa';
}

export function initDevPanelUpscaling(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-upscaling',
    title: 'AA & Upscaling',
    open: false,
    body: `
      <p class="dev-hint"><strong>AA:</strong> SMAA (edge detect, before sRGB — default) or FXAA (after display). Both are spatial; neither removes temporal crawl on thin needles under motion. Debug → Disable AA turns both off.</p>
      <label class="dev-row">
        <span>AA method</span>
        <select id="dev-aa-method">
          <option value="smaa">SMAA</option>
          <option value="fxaa">FXAA</option>
          <option value="off">Off</option>
        </select>
      </label>
      <label class="dev-row dev-row-check">
        <span>Enable upscaling</span>
        <input type="checkbox" id="dev-upscale-enabled" />
      </label>
      <label class="dev-row">
        <span>Resolution scale</span>
        <input type="range" id="dev-upscale-scale" min="0.25" max="1" step="0.05" value="${DEFAULTS.resolutionScale}" />
        <output id="dev-upscale-scale-out">${formatScale(DEFAULTS.resolutionScale)}</output>
      </label>
      <label class="dev-row">
        <span>Method</span>
        <select id="dev-upscale-method">
          <option value="fsr1">FSR1</option>
          <option value="bilinear">Bilinear</option>
        </select>
      </label>
      <label class="dev-row">
        <span>RCAS sharpness (0=sharp)</span>
        <input type="range" id="dev-upscale-sharpness" min="0" max="2" step="0.05" value="${DEFAULTS.sharpness}" />
        <output id="dev-upscale-sharpness-out">${formatSharpness(DEFAULTS.sharpness)}</output>
      </label>
      <label class="dev-row dev-row-check">
        <span>RCAS denoise (noisy areas)</span>
        <input type="checkbox" id="dev-upscale-denoise" />
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-upscale-reset">Reset AA &amp; upscaling</button>
      </div>
    `,
  });
  if (!body) return () => {};

  syncUpscalingUi(panel, postFX.getUpscalingSettings(), postFX.getAaMethod());

  const disposers: Array<() => void> = [];

  const aaSelect = panel.querySelector('#dev-aa-method') as HTMLSelectElement | null;
  const onAaChange = () => {
    if (!aaSelect) return;
    postFX.setAaMethod(parseAaMethod(aaSelect.value));
    syncUpscalingUi(panel, postFX.getUpscalingSettings(), postFX.getAaMethod());
  };
  aaSelect?.addEventListener('change', onAaChange);

  disposers.push(
    bindCheckbox(
      panel,
      'dev-upscale-enabled',
      () => postFX.getUpscalingSettings().enabled,
      (enabled) => postFX.setUpscalingSettings({ enabled }),
    ),
  );

  disposers.push(
    bindRange(
      panel,
      'dev-upscale-scale',
      'dev-upscale-scale-out',
      formatScale,
      (resolutionScale) => {
        postFX.setUpscalingSettings({ resolutionScale });
      },
    ),
  );

  disposers.push(
    bindRange(
      panel,
      'dev-upscale-sharpness',
      'dev-upscale-sharpness-out',
      formatSharpness,
      (sharpness) => {
        postFX.setUpscalingSettings({ sharpness });
      },
    ),
  );

  disposers.push(
    bindCheckbox(
      panel,
      'dev-upscale-denoise',
      () => postFX.getUpscalingSettings().denoise,
      (denoise) => postFX.setUpscalingSettings({ denoise }),
    ),
  );

  const methodSelect = panel.querySelector('#dev-upscale-method') as HTMLSelectElement | null;
  const onMethodChange = () => {
    if (!methodSelect) return;
    postFX.setUpscalingSettings({ method: parseMethod(methodSelect.value) });
  };
  methodSelect?.addEventListener('change', onMethodChange);

  const resetBtn = panel.querySelector('#dev-upscale-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.setAaMethod(DEFAULT_AA);
    postFX.setUpscalingSettings({ ...DEFAULTS });
    syncUpscalingUi(panel, postFX.getUpscalingSettings(), postFX.getAaMethod());
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    aaSelect?.removeEventListener('change', onAaChange);
    methodSelect?.removeEventListener('change', onMethodChange);
    resetBtn?.removeEventListener('click', onReset);
  };
}
