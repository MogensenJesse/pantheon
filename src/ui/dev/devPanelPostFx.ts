// src/ui/dev/devPanelPostFx.ts — DEV-only screen-space FX (pixel size + color levels)
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import { bindRange, injectRangeRows, mountSection, syncSlider, type RangeSpec } from './bindRange';
import { setFpsCounterEnabled } from '../FpsCounter';
import { devSettings } from '../../core/GameState';
import { resetPostFxDev } from './postFxDev';

const POSTFX_SPECS: RangeSpec[] = [
  {
    id: 'dev-pixel-size',
    label: 'Pixel size',
    min: 1,
    max: 16,
    step: 1,
    defaultValue: VISUAL.postFx.pixelSize,
    format: (v) => String(v),
  },
  {
    id: 'dev-color-levels',
    label: 'Color levels',
    min: 1,
    max: 48,
    step: 1,
    defaultValue: VISUAL.postFx.colorLevels,
    format: (v) => String(v),
  },
];

export function initDevPanelPostFx(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-postfx',
    title: 'Post FX',
    open: false,
    body: `
      <div id="dev-postfx-rows"></div>
      <label class="dev-row dev-row-check">
        <span>Show FPS</span>
        <input type="checkbox" id="dev-show-fps" />
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-postfx-reset">Reset post FX</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const rowHost = panel.querySelector('#dev-postfx-rows');
  if (rowHost) injectRangeRows(rowHost, POSTFX_SPECS);

  const disposers: Array<() => void> = [];
  disposers.push(
    bindRange(panel, 'dev-pixel-size', 'dev-pixel-size-out', (v) => String(v), (v) => {
      postFX.setPixelSize(v);
    }),
  );
  disposers.push(
    bindRange(panel, 'dev-color-levels', 'dev-color-levels-out', (v) => String(v), (v) => {
      postFX.setColorLevels(v);
    }),
  );

  const showFps = panel.querySelector('#dev-show-fps') as HTMLInputElement | null;
  let onFpsChange: (() => void) | null = null;
  if (showFps) {
    showFps.checked = devSettings.showFpsCounter;
    onFpsChange = () => setFpsCounterEnabled(showFps.checked);
    showFps.addEventListener('change', onFpsChange);
  }

  const resetBtn = panel.querySelector('#dev-postfx-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetPostFxDev(postFX);
    for (const s of POSTFX_SPECS) {
      syncSlider(panel, s.id, `${s.id}-out`, VISUAL.postFx[s.id === 'dev-pixel-size' ? 'pixelSize' : 'colorLevels'], s.format);
    }
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    if (showFps && onFpsChange) showFps.removeEventListener('change', onFpsChange);
    resetBtn?.removeEventListener('click', onReset);
  };
}
