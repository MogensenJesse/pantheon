// src/ui/dev/devPanelGrass.ts — GPU grass tuning (DEV)
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { GrassSystem } from '../../world/grass/GrassSystem';
import { applyGrassDevUniforms, resetGrassDevSettings } from '../../world/grass/applyGrassDevUniforms';
import { grassUniforms } from '../../world/grass/grassUniforms';
import {
  bindCheckbox,
  bindRange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSlider,
} from './bindRange';

const GRASS_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-wind-strength',
    label: 'Wind strength',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: VISUAL.grass.windStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-wind-speed',
    label: 'Wind speed',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.windSpeed,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-thin-r0',
    label: 'Thin inner (m)',
    min: 0,
    max: 80,
    step: 0.5,
    defaultValue: VISUAL.grass.thinningR0,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-thin-r1',
    label: 'Thin outer (m)',
    min: 0,
    max: 120,
    step: 0.5,
    defaultValue: VISUAL.grass.thinningR1,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-grass-thin-pmin',
    label: 'Thin p min',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.grass.thinningPMin,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-scale-min',
    label: 'Scale min',
    min: 0.2,
    max: 2,
    step: 0.01,
    defaultValue: VISUAL.grass.bladeMinScale,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-scale-max',
    label: 'Scale max',
    min: 0.2,
    max: 3,
    step: 0.01,
    defaultValue: VISUAL.grass.bladeMaxScale,
    format: (v) => v.toFixed(2),
  },
];

type GrassSliderKey =
  | 'windStrength'
  | 'windSpeed'
  | 'thinningR0'
  | 'thinningR1'
  | 'thinningPMin'
  | 'bladeMinScale'
  | 'bladeMaxScale';

const KEY_MAP: Record<string, GrassSliderKey> = {
  'dev-grass-wind-strength': 'windStrength',
  'dev-grass-wind-speed': 'windSpeed',
  'dev-grass-thin-r0': 'thinningR0',
  'dev-grass-thin-r1': 'thinningR1',
  'dev-grass-thin-pmin': 'thinningPMin',
  'dev-grass-scale-min': 'bladeMinScale',
  'dev-grass-scale-max': 'bladeMaxScale',
};

function syncUi(panel: HTMLDivElement): void {
  const g = devSettings.grass;
  for (const s of GRASS_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, g[KEY_MAP[s.id]], s.format);
  }
}

export function initDevPanelGrass(panel: HTMLDivElement, grass: GrassSystem): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-grass',
    title: 'Grass',
    open: true,
    body: `
      <p class="dev-hint">Biome-driven GPU field (Forest/Hills/Shore). Full reload after map sculpt.</p>
      <label class="dev-row dev-row-check">
        <span>Enabled</span>
        <input type="checkbox" id="dev-grass-enabled" checked />
      </label>
      <div id="dev-grass-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-grass-reset">Reset grass</button>
      </div>
    `,
  });

  const host = body?.querySelector('#dev-grass-rows');
  if (host) injectRangeRows(host, GRASS_SPECS);

  const g = devSettings.grass;
  const disposers: Array<() => void> = [];
  for (const s of GRASS_SPECS) {
    const key = KEY_MAP[s.id];
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        g[key] = v;
        applyGrassDevUniforms();
        if (key === 'bladeMinScale' || key === 'bladeMaxScale') {
          void grass.reinitInstances();
        }
      }),
    );
  }

  disposers.push(
    bindCheckbox(
      panel,
      'dev-grass-enabled',
      () => g.enabled,
      (checked) => {
        g.enabled = checked;
        grass.mesh.visible = checked;
      },
    ),
  );

  const resetBtn = panel.querySelector('#dev-grass-reset');
  const onReset = () => {
    resetGrassDevSettings();
    syncUi(panel);
    grass.mesh.visible = g.enabled;
    void grass.reinitInstances();
  };
  resetBtn?.addEventListener('click', onReset);

  applyGrassDevUniforms();
  grassUniforms.uBaseColor.value.set(VISUAL.grass.baseColor);
  grassUniforms.uTipColor.value.set(VISUAL.grass.tipColor);
  syncUi(panel);

  return () => {
    resetBtn?.removeEventListener('click', onReset);
    for (const fn of disposers) fn();
    body?.closest('details')?.remove();
  };
}
