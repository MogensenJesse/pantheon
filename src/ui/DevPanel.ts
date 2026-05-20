// src/ui/DevPanel.ts — development-only cheats and tuning (Vite DEV builds only)
import { bus } from '../core/EventBus';
import { devSettings, state } from '../core/GameState';
import type { PostFXContext } from '../rendering/PostFX';
import { PHASE0 } from '../config/phase0';
import { WORLD } from '../world/WorldConfig';
import {
  applyTerrainDevUniforms,
  resetTerrainDevSettings,
} from '../world/terrain/applyTerrainDevUniforms';
import { setFpsCounterEnabled } from './FpsCounter';
import type { ShaderMaterial } from 'three';

export interface DevPanelTerrainContext {
  terrainMaterial: ShaderMaterial;
}

function setEnergy(value: number): void {
  state.energy = Math.min(state.energyCap, Math.max(0, value));
  bus.emit('energy:changed', { energy: state.energy, cap: state.energyCap });
}

function findAllStones(): void {
  for (const stone of WORLD.LANDMARKS.stones) {
    if (!state.stonesFound.has(stone.id)) {
      state.stonesFound.add(stone.id);
      state.energy = Math.min(state.energyCap, state.energy + PHASE0.LANDMARK_ENERGY.stone);
      bus.emit('stone:touched', { stoneId: stone.id });
    }
  }
  bus.emit('energy:changed', { energy: state.energy, cap: state.energyCap });
}

export function initDevPanel(
  postFX: PostFXContext,
  terrainCtx?: DevPanelTerrainContext,
): () => void {
  if (!import.meta.env.DEV) return () => {};

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'dev-toggle';
  toggle.textContent = 'Dev';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'dev-panel');

  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="dev-title">Development</div>
    <label class="dev-row">
      <span>Energy</span>
      <input type="range" id="dev-energy" min="0" max="100" step="1" value="0" />
      <output id="dev-energy-out">0</output>
    </label>
    <div class="dev-actions">
      <button type="button" data-energy="0">0%</button>
      <button type="button" data-energy="25">25%</button>
      <button type="button" data-energy="50">50%</button>
      <button type="button" data-energy="100">100%</button>
      <button type="button" id="dev-energy-plus">+25</button>
    </div>
    <div class="dev-title dev-subtitle">Terrain textures</div>
    <label class="dev-row">
      <span>Tile repeat</span>
      <input type="range" id="dev-tex-repeat" min="0.02" max="0.2" step="0.005" value="0.08" />
      <output id="dev-tex-repeat-out">0.08</output>
    </label>
    <label class="dev-row dev-row-check">
      <span>Displacement</span>
      <input type="checkbox" id="dev-tex-disp-on" checked />
    </label>
    <label class="dev-row">
      <span>Disp. scale</span>
      <input type="range" id="dev-tex-disp" min="0" max="2" step="0.05" value="0.45" />
      <output id="dev-tex-disp-out">0.45</output>
    </label>
    <label class="dev-row">
      <span>Normals</span>
      <input type="range" id="dev-tex-normal" min="0" max="2" step="0.05" value="1" />
      <output id="dev-tex-normal-out">1.00</output>
    </label>
    <label class="dev-row">
      <span>AO</span>
      <input type="range" id="dev-tex-ao" min="0" max="1" step="0.05" value="0.85" />
      <output id="dev-tex-ao-out">0.85</output>
    </label>
    <label class="dev-row">
      <span>Specular</span>
      <input type="range" id="dev-tex-spec" min="0" max="1" step="0.05" value="0.35" />
      <output id="dev-tex-spec-out">0.35</output>
    </label>
    <label class="dev-row">
      <span>Rock slope</span>
      <input type="range" id="dev-tex-slope" min="0.4" max="1" step="0.05" value="0.75" />
      <output id="dev-tex-slope-out">0.75</output>
    </label>
    <label class="dev-row">
      <span>Path blend</span>
      <input type="range" id="dev-tex-path-blend" min="0.3" max="4" step="0.1" value="1.6" />
      <output id="dev-tex-path-blend-out">1.6</output>
    </label>
    <div class="dev-actions">
      <button type="button" id="dev-tex-reset">Reset terrain</button>
    </div>
    <div class="dev-title dev-subtitle">Post FX</div>
    <label class="dev-row">
      <span>Pixel size</span>
      <input type="range" id="dev-pixel-size" min="1" max="16" step="1" value="4" />
      <output id="dev-pixel-size-out">4</output>
    </label>
    <label class="dev-row">
      <span>Color levels</span>
      <input type="range" id="dev-color-levels" min="1" max="48" step="1" value="24" />
      <output id="dev-color-levels-out">24</output>
    </label>
    <label class="dev-row">
      <span>FX quality</span>
      <select id="dev-fx-quality">
        <option value="low" selected>Low</option>
        <option value="high">High</option>
      </select>
    </label>
    <label class="dev-row dev-row-check">
      <span>Show FPS</span>
      <input type="checkbox" id="dev-show-fps" />
    </label>
    <label class="dev-row">
      <span>Move speed</span>
      <select id="dev-speed">
        <option value="1">1×</option>
        <option value="2">2×</option>
        <option value="4">4×</option>
        <option value="8">8×</option>
      </select>
    </label>
    <div class="dev-actions">
      <button type="button" id="dev-stones">All standing stones</button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #dev-toggle {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 200;
      padding: 6px 12px;
      font-family: system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: rgba(220, 200, 255, 0.9);
      background: rgba(12, 10, 24, 0.85);
      border: 1px solid rgba(180, 140, 255, 0.35);
      border-radius: 4px;
      cursor: pointer;
      pointer-events: auto;
    }
    #dev-toggle:hover {
      border-color: rgba(200, 160, 255, 0.6);
    }
    #dev-panel {
      position: fixed;
      top: 44px;
      left: 12px;
      z-index: 200;
      width: 220px;
      padding: 12px 14px;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      color: rgba(210, 200, 230, 0.95);
      background: rgba(12, 10, 24, 0.92);
      border: 1px solid rgba(180, 140, 255, 0.25);
      border-radius: 6px;
      pointer-events: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
    }
    #dev-panel .dev-title {
      margin-bottom: 10px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(180, 150, 220, 0.7);
    }
    #dev-panel .dev-subtitle {
      margin-top: 4px;
    }
    #dev-panel .dev-row {
      display: grid;
      grid-template-columns: 56px 1fr 32px;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    #dev-panel .dev-row-check {
      grid-template-columns: 1fr auto;
    }
    #dev-panel .dev-row-check input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    #dev-panel .dev-row span {
      color: rgba(200, 190, 220, 0.75);
    }
    #dev-panel .dev-row input[type="range"] {
      width: 100%;
    }
    #dev-panel .dev-row output {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    #dev-panel .dev-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }
    #dev-panel .dev-actions:last-child {
      margin-bottom: 0;
    }
    #dev-panel button,
    #dev-panel select {
      padding: 5px 8px;
      font-size: 11px;
      color: inherit;
      background: rgba(40, 32, 64, 0.8);
      border: 1px solid rgba(140, 110, 200, 0.35);
      border-radius: 4px;
      cursor: pointer;
    }
    #dev-panel button:hover {
      background: rgba(60, 48, 96, 0.9);
    }
    #dev-panel select {
      width: 100%;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  const energySlider = panel.querySelector('#dev-energy') as HTMLInputElement;
  const energyOut = panel.querySelector('#dev-energy-out') as HTMLOutputElement;
  const speedSelect = panel.querySelector('#dev-speed') as HTMLSelectElement;
  const pixelSizeSlider = panel.querySelector('#dev-pixel-size') as HTMLInputElement;
  const pixelSizeOut = panel.querySelector('#dev-pixel-size-out') as HTMLOutputElement;
  const colorLevelsSlider = panel.querySelector('#dev-color-levels') as HTMLInputElement;
  const colorLevelsOut = panel.querySelector('#dev-color-levels-out') as HTMLOutputElement;
  const fxQualitySelect = panel.querySelector('#dev-fx-quality') as HTMLSelectElement;
  const showFpsCheck = panel.querySelector('#dev-show-fps') as HTMLInputElement;

  const texRepeatSlider = panel.querySelector('#dev-tex-repeat') as HTMLInputElement | null;
  const texRepeatOut = panel.querySelector('#dev-tex-repeat-out') as HTMLOutputElement | null;
  const texDispOn = panel.querySelector('#dev-tex-disp-on') as HTMLInputElement | null;
  const texDispSlider = panel.querySelector('#dev-tex-disp') as HTMLInputElement | null;
  const texDispOut = panel.querySelector('#dev-tex-disp-out') as HTMLOutputElement | null;
  const texNormalSlider = panel.querySelector('#dev-tex-normal') as HTMLInputElement | null;
  const texNormalOut = panel.querySelector('#dev-tex-normal-out') as HTMLOutputElement | null;
  const texAoSlider = panel.querySelector('#dev-tex-ao') as HTMLInputElement | null;
  const texAoOut = panel.querySelector('#dev-tex-ao-out') as HTMLOutputElement | null;
  const texSpecSlider = panel.querySelector('#dev-tex-spec') as HTMLInputElement | null;
  const texSpecOut = panel.querySelector('#dev-tex-spec-out') as HTMLOutputElement | null;
  const texSlopeSlider = panel.querySelector('#dev-tex-slope') as HTMLInputElement | null;
  const texSlopeOut = panel.querySelector('#dev-tex-slope-out') as HTMLOutputElement | null;
  const texPathBlendSlider = panel.querySelector('#dev-tex-path-blend') as HTMLInputElement | null;
  const texPathBlendOut = panel.querySelector('#dev-tex-path-blend-out') as HTMLOutputElement | null;

  const syncTerrainUi = () => {
    const t = devSettings.terrain;
    if (texRepeatSlider) {
      texRepeatSlider.value = String(t.textureRepeat);
      if (texRepeatOut) texRepeatOut.textContent = t.textureRepeat.toFixed(3);
    }
    if (texDispOn) texDispOn.checked = t.displacementEnabled;
    if (texDispSlider) {
      texDispSlider.value = String(t.displacementScale);
      if (texDispOut) texDispOut.textContent = t.displacementScale.toFixed(2);
    }
    if (texNormalSlider) {
      texNormalSlider.value = String(t.normalStrength);
      if (texNormalOut) texNormalOut.textContent = t.normalStrength.toFixed(2);
    }
    if (texAoSlider) {
      texAoSlider.value = String(t.aoStrength);
      if (texAoOut) texAoOut.textContent = t.aoStrength.toFixed(2);
    }
    if (texSpecSlider) {
      texSpecSlider.value = String(t.specularStrength);
      if (texSpecOut) texSpecOut.textContent = t.specularStrength.toFixed(2);
    }
    if (texSlopeSlider) {
      texSlopeSlider.value = String(t.slopeRockStart);
      if (texSlopeOut) texSlopeOut.textContent = t.slopeRockStart.toFixed(2);
    }
    if (texPathBlendSlider) {
      texPathBlendSlider.value = String(t.pathBlendSoft);
      if (texPathBlendOut) texPathBlendOut.textContent = t.pathBlendSoft.toFixed(1);
    }
    if (terrainCtx) {
      applyTerrainDevUniforms(terrainCtx.terrainMaterial);
    }
  };

  const syncEnergyUi = () => {
    energySlider.value = String(state.energy);
    energyOut.textContent = String(Math.round(state.energy));
  };

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  energySlider.addEventListener('input', () => {
    setEnergy(Number(energySlider.value));
    syncEnergyUi();
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-energy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setEnergy(Number(btn.dataset.energy));
      syncEnergyUi();
    });
  });

  panel.querySelector('#dev-energy-plus')?.addEventListener('click', () => {
    setEnergy(state.energy + 25);
    syncEnergyUi();
  });

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
  });

  speedSelect.addEventListener('change', () => {
    devSettings.movementSpeedMultiplier = Number(speedSelect.value);
  });

  showFpsCheck.checked = devSettings.showFpsCounter;
  showFpsCheck.addEventListener('change', () => {
    setFpsCounterEnabled(showFpsCheck.checked);
  });

  panel.querySelector('#dev-stones')?.addEventListener('click', () => findAllStones());

  if (terrainCtx && texRepeatSlider) {
    texRepeatSlider.addEventListener('input', () => {
      devSettings.terrain.textureRepeat = Number(texRepeatSlider.value);
      syncTerrainUi();
    });
    texDispOn?.addEventListener('change', () => {
      devSettings.terrain.displacementEnabled = texDispOn.checked;
      syncTerrainUi();
    });
    texDispSlider?.addEventListener('input', () => {
      devSettings.terrain.displacementScale = Number(texDispSlider.value);
      syncTerrainUi();
    });
    texNormalSlider?.addEventListener('input', () => {
      devSettings.terrain.normalStrength = Number(texNormalSlider.value);
      syncTerrainUi();
    });
    texAoSlider?.addEventListener('input', () => {
      devSettings.terrain.aoStrength = Number(texAoSlider.value);
      syncTerrainUi();
    });
    texSpecSlider?.addEventListener('input', () => {
      devSettings.terrain.specularStrength = Number(texSpecSlider.value);
      syncTerrainUi();
    });
    texSlopeSlider?.addEventListener('input', () => {
      devSettings.terrain.slopeRockStart = Number(texSlopeSlider.value);
      syncTerrainUi();
    });
    texPathBlendSlider?.addEventListener('input', () => {
      devSettings.terrain.pathBlendSoft = Number(texPathBlendSlider.value);
      syncTerrainUi();
    });
    panel.querySelector('#dev-tex-reset')?.addEventListener('click', () => {
      resetTerrainDevSettings();
      syncTerrainUi();
    });
    syncTerrainUi();
  }

  bus.on('energy:changed', syncEnergyUi);
  syncEnergyUi();

  return () => {
    bus.off('energy:changed', syncEnergyUi);
  };
}
