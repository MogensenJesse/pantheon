// src/ui/dev/devPanelGrass.ts

import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { AssetScatterer } from '../../world/AssetScatterer';
import { resetGrassDev } from '../../world/grass/grassDevDefaults';
import { applyGrassDevUniforms } from '../../world/grass/grassMaterial';
import {
  bindRange,
  bindRangeOnChange,
  injectRangeRows,
  mountSection,
  type RangeSpec,
  syncSpecs,
} from './bindRange';

const WIND_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-wind-strength',
    label: 'Wind strength',
    min: 0,
    max: 0.6,
    step: 0.02,
    defaultValue: VISUAL.grass.windStrength,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-wind-speed',
    label: 'Wind speed',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.grass.windSpeed,
    format: (v) => v.toFixed(2),
  },
];

const SCATTER_SPECS: RangeSpec[] = [
  {
    id: 'dev-grass-density',
    label: 'Density ×',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.grass.densityMul,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-grass-scale',
    label: 'Blade scale ×',
    min: 0.5,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.grass.scaleMul,
    format: (v) => v.toFixed(2),
  },
];

export function initDevPanelGrass(panel: HTMLDivElement, _scatterer: AssetScatterer): () => void {
  void _scatterer;
  const body = mountSection(panel, {
    hostId: 'dev-section-grass',
    title: 'Grass',
    open: false,
    body: `
      <p class="dev-hint">Wind — live</p>
      <div id="dev-grass-wind-rows"></div>
      <p class="dev-hint">Scatter — release slider to rebuild</p>
      <div id="dev-grass-scatter-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-grass-reset">Reset grass</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const windHost = panel.querySelector('#dev-grass-wind-rows');
  if (windHost) injectRangeRows(windHost, WIND_SPECS);
  const scatterHost = panel.querySelector('#dev-grass-scatter-rows');
  if (scatterHost) injectRangeRows(scatterHost, SCATTER_SPECS);

  const g = devSettings.grass;
  const readGrass = (s: RangeSpec): number => {
    switch (s.id) {
      case 'dev-grass-wind-strength':
        return g.windStrength;
      case 'dev-grass-wind-speed':
        return g.windSpeed;
      case 'dev-grass-density':
        return g.densityMul;
      case 'dev-grass-scale':
        return g.scaleMul;
      default:
        return s.defaultValue;
    }
  };
  const allSpecs = [...WIND_SPECS, ...SCATTER_SPECS];
  const syncGrassUi = () => syncSpecs(panel, allSpecs, readGrass);

  syncGrassUi();

  const disposers: Array<() => void> = [];
  disposers.push(
    bindRange(
      panel,
      'dev-grass-wind-strength',
      'dev-grass-wind-strength-out',
      (v) => v.toFixed(2),
      (v) => {
        g.windStrength = v;
        applyGrassDevUniforms();
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      'dev-grass-wind-speed',
      'dev-grass-wind-speed-out',
      (v) => v.toFixed(2),
      (v) => {
        g.windSpeed = v;
        applyGrassDevUniforms();
      },
    ),
  );
  disposers.push(
    bindRangeOnChange(
      panel,
      'dev-grass-density',
      'dev-grass-density-out',
      (v) => v.toFixed(2),
      (v) => {
        g.densityMul = v;
        g.dirty = true;
      },
    ),
  );
  disposers.push(
    bindRangeOnChange(
      panel,
      'dev-grass-scale',
      'dev-grass-scale-out',
      (v) => v.toFixed(2),
      (v) => {
        g.scaleMul = v;
        g.dirty = true;
      },
    ),
  );

  const resetBtn = panel.querySelector('#dev-grass-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetGrassDev(g);
    applyGrassDevUniforms();
    g.dirty = true;
    syncGrassUi();
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
