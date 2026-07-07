// src/ui/dev/devPanelUpscaling.ts — play-mode FSR1 / resolution scale (PostFX)
import { type UpscalingMethod, type UpscalingSettings, VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import { bindCheckbox, bindRange, mountSection } from './bindRange';

const DEFAULTS: UpscalingSettings = { ...VISUAL.render.upscaling };

const formatScale = (v: number) => v.toFixed(2);
const formatSharpness = (v: number) => v.toFixed(2);

function syncUpscalingUi(panel: HTMLDivElement, settings: UpscalingSettings): void {
  const enabled = panel.querySelector('#dev-upscale-enabled') as HTMLInputElement | null;
  const scale = panel.querySelector('#dev-upscale-scale') as HTMLInputElement | null;
  const scaleOut = panel.querySelector('#dev-upscale-scale-out') as HTMLOutputElement | null;
  const method = panel.querySelector('#dev-upscale-method') as HTMLSelectElement | null;
  const sharpness = panel.querySelector('#dev-upscale-sharpness') as HTMLInputElement | null;
  const sharpnessOut = panel.querySelector(
    '#dev-upscale-sharpness-out',
  ) as HTMLOutputElement | null;
  const denoise = panel.querySelector('#dev-upscale-denoise') as HTMLInputElement | null;

  if (enabled) enabled.checked = settings.enabled;
  if (scale) scale.value = String(settings.resolutionScale);
  if (scaleOut) scaleOut.textContent = formatScale(settings.resolutionScale);
  if (method) method.value = settings.method;
  if (sharpness) sharpness.value = String(settings.sharpness);
  if (sharpnessOut) sharpnessOut.textContent = formatSharpness(settings.sharpness);
  if (denoise) denoise.checked = settings.denoise;
}

function parseMethod(value: string): UpscalingMethod {
  return value === 'bilinear' ? 'bilinear' : 'fsr1';
}

export function initDevPanelUpscaling(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-upscaling',
    title: 'Upscaling (FSR1)',
    open: false,
    body: `
      <p class="dev-hint">Lowers scene-pass resolution; post-FX is baked to the same scale, then upscaled after FXAA. For a clear FSR vs bilinear A/B, try scale <strong>0.50</strong> and zoom grass/prop edges. Sharpness is RCAS only (<strong>0 = max sharpen</strong>, 2 = off). Denoise softens RCAS in noisy areas (grass, bloom) — subtle on clean sky.</p>
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
        <button type="button" id="dev-upscale-reset">Reset upscaling</button>
      </div>
    `,
  });
  if (!body) return () => {};

  syncUpscalingUi(panel, postFX.getUpscalingSettings());

  const disposers: Array<() => void> = [];

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
    postFX.setUpscalingSettings({ ...DEFAULTS });
    syncUpscalingUi(panel, postFX.getUpscalingSettings());
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    methodSelect?.removeEventListener('change', onMethodChange);
    resetBtn?.removeEventListener('click', onReset);
  };
}
