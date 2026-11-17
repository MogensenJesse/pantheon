// src/dev/panel/devPanelPainterly.ts — DEV painterly pass (anisotropic Kuwahara) controls
import { VISUAL } from '../../config/visualTuning';
import type { PainterlyParams, PostFXContext } from '../../rendering/PostFX';
import {
  bindCheckbox,
  bindSpecs,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSpecs,
} from '../bindRange';

const P = VISUAL.postfx.painterly;

interface PainterlySpec extends RangeSpec {
  key: Exclude<keyof PainterlyParams, 'enabled'>;
}

const spec = (
  key: PainterlySpec['key'],
  label: string,
  min: number,
  max: number,
  step: number,
  digits: number,
): PainterlySpec => ({
  id: `dev-painterly-${key}`,
  label,
  min,
  max,
  step,
  defaultValue: P[key],
  format: (v) => v.toFixed(digits),
  key,
});

// Radius is capped at 8: the filter loops (2·radius+1)² taps per pixel at worst.
const SPECS: PainterlySpec[] = [
  spec('strength', 'Strength', 0, 1, 0.05, 2),
  spec('radius', 'Radius (px)', 1, 8, 0.5, 1),
  spec('anisotropy', 'Anisotropy', 0.1, 3, 0.05, 2),
  spec('hardness', 'Hardness', 0, 40, 0.5, 1),
  spec('sharpness', 'Sharpness', 1, 12, 0.5, 1),
  spec('grain', 'Canvas grain', 0, 0.3, 0.01, 2),
  spec('resolutionScale', 'Filter res', 0.25, 1, 0.05, 2),
];

export function initDevPanelPainterly(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-painterly',
    title: 'Painterly',
    open: false,
    body: `
      <p class="dev-hint">Screen-space anisotropic Kuwahara after the grade, before DoF. Radius and filter res cost GPU time; off = zero cost.</p>
      <label class="dev-row dev-row-check">
        <span>Enabled</span>
        <input type="checkbox" id="dev-painterly-enabled" />
      </label>
      <div id="dev-painterly-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-painterly-reset">Reset painterly</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const rows = panel.querySelector('#dev-painterly-rows');
  if (rows) injectRangeRows(rows, SPECS);

  const syncUi = () => {
    const params = postFX.getPainterlyParams();
    syncSpecs(panel, SPECS, (s) => params[s.key]);
    const box = panel.querySelector('#dev-painterly-enabled') as HTMLInputElement | null;
    if (box) box.checked = params.enabled;
  };
  syncUi();

  const disposers = bindSpecs(panel, SPECS, (s, v) => {
    postFX.setPainterlyParams({ [s.key]: v } as Partial<PainterlyParams>);
  });
  disposers.push(
    bindCheckbox(
      panel,
      'dev-painterly-enabled',
      () => postFX.getPainterlyParams().enabled,
      (v) => postFX.setPainterlyParams({ enabled: v }),
    ),
  );

  const resetBtn = panel.querySelector('#dev-painterly-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetPainterlyParams();
    syncUi();
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
