// src/ui/dev/devPanelTerrain.ts
import { devSettings } from '../../core/GameState';
import { resetTerrainDevSettings } from '../../world/terrain/applyTerrainDevUniforms';
import type { TerrainSplatMaterial } from '../../world/terrain/TerrainSplatMaterial';

export function initDevPanelTerrain(
  panel: HTMLDivElement,
  _terrainMaterial: TerrainSplatMaterial,
): void {
  const texRepeatSlider = panel.querySelector('#dev-tex-repeat') as HTMLInputElement;
  const texRepeatOut = panel.querySelector('#dev-tex-repeat-out') as HTMLOutputElement;
  const texDispOn = panel.querySelector('#dev-tex-disp-on') as HTMLInputElement;
  const texDispSlider = panel.querySelector('#dev-tex-disp') as HTMLInputElement;
  const texDispOut = panel.querySelector('#dev-tex-disp-out') as HTMLOutputElement;
  const texNormalSlider = panel.querySelector('#dev-tex-normal') as HTMLInputElement;
  const texNormalOut = panel.querySelector('#dev-tex-normal-out') as HTMLOutputElement;
  const texAoSlider = panel.querySelector('#dev-tex-ao') as HTMLInputElement;
  const texAoOut = panel.querySelector('#dev-tex-ao-out') as HTMLOutputElement;
  const texSpecSlider = panel.querySelector('#dev-tex-spec') as HTMLInputElement;
  const texSpecOut = panel.querySelector('#dev-tex-spec-out') as HTMLOutputElement;
  const texSlopeSlider = panel.querySelector('#dev-tex-slope') as HTMLInputElement;
  const texSlopeOut = panel.querySelector('#dev-tex-slope-out') as HTMLOutputElement;
  const texPathBlendSlider = panel.querySelector('#dev-tex-path-blend') as HTMLInputElement;
  const texPathBlendOut = panel.querySelector('#dev-tex-path-blend-out') as HTMLOutputElement;

  const markTerrainDirty = () => {
    devSettings.terrain.dirty = true;
  };

  const syncTerrainUi = () => {
    const t = devSettings.terrain;
    texRepeatSlider.value = String(t.textureRepeat);
    texRepeatOut.textContent = t.textureRepeat.toFixed(3);
    texDispOn.checked = t.displacementEnabled;
    texDispSlider.value = String(t.displacementScale);
    texDispOut.textContent = t.displacementScale.toFixed(2);
    texNormalSlider.value = String(t.normalStrength);
    texNormalOut.textContent = t.normalStrength.toFixed(2);
    texAoSlider.value = String(t.aoStrength);
    texAoOut.textContent = t.aoStrength.toFixed(2);
    texSpecSlider.value = String(t.specularStrength);
    texSpecOut.textContent = t.specularStrength.toFixed(2);
    texSlopeSlider.value = String(t.slopeRockStart);
    texSlopeOut.textContent = t.slopeRockStart.toFixed(2);
    texPathBlendSlider.value = String(t.pathBlendSoft);
    texPathBlendOut.textContent = t.pathBlendSoft.toFixed(1);
  };

  texRepeatSlider.addEventListener('input', () => {
    devSettings.terrain.textureRepeat = Number(texRepeatSlider.value);
    markTerrainDirty();
    syncTerrainUi();
  });
  texDispOn.addEventListener('change', () => {
    devSettings.terrain.displacementEnabled = texDispOn.checked;
    markTerrainDirty();
    syncTerrainUi();
  });
  texDispSlider.addEventListener('input', () => {
    devSettings.terrain.displacementScale = Number(texDispSlider.value);
    markTerrainDirty();
    syncTerrainUi();
  });
  texNormalSlider.addEventListener('input', () => {
    devSettings.terrain.normalStrength = Number(texNormalSlider.value);
    markTerrainDirty();
    syncTerrainUi();
  });
  texAoSlider.addEventListener('input', () => {
    devSettings.terrain.aoStrength = Number(texAoSlider.value);
    markTerrainDirty();
    syncTerrainUi();
  });
  texSpecSlider.addEventListener('input', () => {
    devSettings.terrain.specularStrength = Number(texSpecSlider.value);
    markTerrainDirty();
    syncTerrainUi();
  });
  texSlopeSlider.addEventListener('input', () => {
    devSettings.terrain.slopeRockStart = Number(texSlopeSlider.value);
    markTerrainDirty();
    syncTerrainUi();
  });
  texPathBlendSlider.addEventListener('input', () => {
    devSettings.terrain.pathBlendSoft = Number(texPathBlendSlider.value);
    markTerrainDirty();
    syncTerrainUi();
  });
  panel.querySelector('#dev-tex-reset')?.addEventListener('click', () => {
    resetTerrainDevSettings();
    markTerrainDirty();
    syncTerrainUi();
  });

  syncTerrainUi();
}
