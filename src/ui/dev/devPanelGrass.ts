// src/ui/dev/devPanelGrass.ts
import { devSettings } from '../../core/GameState';
import type { AssetScatterer } from '../../world/AssetScatterer';
import { applyGrassDevUniforms } from '../../world/grass/grassMaterial';
import { resetGrassDev } from '../../world/grass/grassDevDefaults';
import { bindRange, bindRangeOnChange, syncSlider } from './bindRange';

export function initDevPanelGrass(panel: HTMLDivElement, _scatterer: AssetScatterer): void {
  const g = devSettings.grass;

  const syncGrassUi = () => {
    syncSlider(panel, 'dev-grass-wind-strength', 'dev-grass-wind-strength-out', g.windStrength, (v) => v.toFixed(2));
    syncSlider(panel, 'dev-grass-wind-speed', 'dev-grass-wind-speed-out', g.windSpeed, (v) => v.toFixed(2));
    syncSlider(panel, 'dev-grass-density', 'dev-grass-density-out', g.densityMul, (v) => v.toFixed(2));
    syncSlider(panel, 'dev-grass-scale', 'dev-grass-scale-out', g.scaleMul, (v) => v.toFixed(2));
  };

  syncGrassUi();

  bindRange(panel, 'dev-grass-wind-strength', 'dev-grass-wind-strength-out', (v) => v.toFixed(2), (v) => {
    g.windStrength = v;
    applyGrassDevUniforms();
    syncGrassUi();
  });
  bindRange(panel, 'dev-grass-wind-speed', 'dev-grass-wind-speed-out', (v) => v.toFixed(2), (v) => {
    g.windSpeed = v;
    applyGrassDevUniforms();
    syncGrassUi();
  });
  bindRangeOnChange(panel, 'dev-grass-density', 'dev-grass-density-out', (v) => v.toFixed(2), (v) => {
    g.densityMul = v;
    g.dirty = true;
  });
  bindRangeOnChange(panel, 'dev-grass-scale', 'dev-grass-scale-out', (v) => v.toFixed(2), (v) => {
    g.scaleMul = v;
    g.dirty = true;
  });

  panel.querySelector('#dev-grass-reset')?.addEventListener('click', () => {
    resetGrassDev(g);
    applyGrassDevUniforms();
    g.dirty = true;
    syncGrassUi();
  });
}
