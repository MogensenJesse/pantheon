// src/ui/dev/devPanelPostFx.ts
import type { BloomParams, PostFXContext } from '../../rendering/PostFX';
import { bindRange } from './bindRange';

export function initDevPanelPostFx(panel: HTMLDivElement, postFX: PostFXContext): void {
  const pixelSizeSlider = panel.querySelector('#dev-pixel-size') as HTMLInputElement;
  const pixelSizeOut = panel.querySelector('#dev-pixel-size-out') as HTMLOutputElement;
  const colorLevelsSlider = panel.querySelector('#dev-color-levels') as HTMLInputElement;
  const colorLevelsOut = panel.querySelector('#dev-color-levels-out') as HTMLOutputElement;
  const fxQualitySelect = panel.querySelector('#dev-fx-quality') as HTMLSelectElement;

  const syncBloomUi = (params: BloomParams) => {
    const set = (id: string, outId: string, value: number, fmt: (n: number) => string) => {
      const slider = panel.querySelector(`#${id}`) as HTMLInputElement | null;
      const output = panel.querySelector(`#${outId}`) as HTMLOutputElement | null;
      if (!slider || !output) return;
      slider.value = String(value);
      output.textContent = fmt(value);
    };
    set('dev-bloom-strength', 'dev-bloom-strength-out', params.emissiveStrength, (n) => n.toFixed(2));
    set('dev-bloom-radius', 'dev-bloom-radius-out', params.radius, (n) => n.toFixed(2));
    set('dev-bloom-scene-mul', 'dev-bloom-scene-mul-out', params.sceneStrengthMul, (n) => n.toFixed(2));
    set('dev-bloom-exposure', 'dev-bloom-exposure-out', params.exposure, (n) => n.toFixed(2));
  };

  const applyBloomPartial = (partial: Partial<BloomParams>) => {
    postFX.setBloomParams(partial);
    syncBloomUi(postFX.getBloomParams());
  };

  pixelSizeSlider.addEventListener('input', () => {
    const v = Number(pixelSizeSlider.value);
    postFX.setPixelSize(v);
    pixelSizeOut.textContent = String(v);
  });

  colorLevelsSlider.addEventListener('input', () => {
    const v = Number(colorLevelsSlider.value);
    postFX.setColorLevels(v);
    colorLevelsOut.textContent = String(v);
  });

  fxQualitySelect.addEventListener('change', () => {
    postFX.setRenderQuality(fxQualitySelect.value === 'high');
    syncBloomUi(postFX.getBloomParams());
  });

  bindRange(panel, 'dev-bloom-strength', 'dev-bloom-strength-out', (n) => n.toFixed(2), (v) =>
    applyBloomPartial({ emissiveStrength: v }),
  );
  bindRange(panel, 'dev-bloom-radius', 'dev-bloom-radius-out', (n) => n.toFixed(2), (v) =>
    applyBloomPartial({ radius: v }),
  );
  bindRange(panel, 'dev-bloom-scene-mul', 'dev-bloom-scene-mul-out', (n) => n.toFixed(2), (v) =>
    applyBloomPartial({ sceneStrengthMul: v }),
  );
  bindRange(panel, 'dev-bloom-exposure', 'dev-bloom-exposure-out', (n) => n.toFixed(2), (v) =>
    applyBloomPartial({ exposure: v }),
  );

  panel.querySelector('#dev-bloom-reset')?.addEventListener('click', () => {
    postFX.resetBloomParams();
    syncBloomUi(postFX.getBloomParams());
  });

  syncBloomUi(postFX.getBloomParams());
}
