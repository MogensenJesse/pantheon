// src/ui/DevPanel.ts — development-only cheats and tuning (Vite DEV builds only)
import { bus } from '../core/EventBus';
import { devSettings, state } from '../core/GameState';
import { PHASE0 } from '../config/phase0';
import type { BloomParams, PostFXContext } from '../rendering/PostFX';
import { WORLD } from '../world/WorldConfig';
import { resetTerrainDevSettings } from '../world/terrain/applyTerrainDevUniforms';
import { setFpsCounterEnabled } from './FpsCounter';
import { mountDevPanelShell } from './DevPanelLayout';
import type { TerrainSplatMaterial } from '../world/terrain/TerrainSplatMaterial';
import type { AssetScatterer } from '../world/AssetScatterer';
import { applyGrassDevUniforms } from '../world/grass/grassMaterial';
import { resetGrassScatterDev } from '../world/grass/grassDevDefaults';

export interface DevPanelTerrainContext {
  terrainMaterial: TerrainSplatMaterial;
  scatterer?: AssetScatterer;
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

function bindRange(
  panel: HTMLDivElement,
  id: string,
  outId: string,
  format: (v: number) => string,
  onChange: (v: number) => void,
): HTMLInputElement {
  const slider = panel.querySelector(`#${id}`) as HTMLInputElement;
  const output = panel.querySelector(`#${outId}`) as HTMLOutputElement;
  const sync = () => {
    const v = Number(slider.value);
    output.textContent = format(v);
    onChange(v);
  };
  slider.addEventListener('input', sync);
  return slider;
}

export function initDevPanel(
  postFX: PostFXContext,
  terrainCtx?: DevPanelTerrainContext,
  onLogRenderDebug?: () => void,
): () => void {
  if (!import.meta.env.DEV) return () => {};

  const { toggle, panel } = mountDevPanelShell();

  const energySlider = panel.querySelector('#dev-energy') as HTMLInputElement;
  const energyOut = panel.querySelector('#dev-energy-out') as HTMLOutputElement;
  const speedSelect = panel.querySelector('#dev-speed') as HTMLSelectElement;
  const pixelSizeSlider = panel.querySelector('#dev-pixel-size') as HTMLInputElement;
  const pixelSizeOut = panel.querySelector('#dev-pixel-size-out') as HTMLOutputElement;
  const colorLevelsSlider = panel.querySelector('#dev-color-levels') as HTMLInputElement;
  const colorLevelsOut = panel.querySelector('#dev-color-levels-out') as HTMLOutputElement;
  const fxQualitySelect = panel.querySelector('#dev-fx-quality') as HTMLSelectElement;
  const showFpsCheck = panel.querySelector('#dev-show-fps') as HTMLInputElement;
  const bindRenderDebugCheck = (id: string, key: keyof typeof devSettings.renderDebug) => {
    const el = panel.querySelector(`#${id}`) as HTMLInputElement | null;
    if (!el) return;
    el.checked = devSettings.renderDebug[key] as boolean;
    el.addEventListener('change', () => {
      (devSettings.renderDebug[key] as boolean) = el.checked;
    });
  };

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
  };

  const markTerrainDirty = () => {
    devSettings.terrain.dirty = true;
  };

  const syncEnergyUi = () => {
    energySlider.value = String(state.energy);
    energyOut.textContent = String(Math.round(state.energy));
  };

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
    syncBloomUi(postFX.getBloomParams());
  });

  speedSelect.addEventListener('change', () => {
    devSettings.movementSpeedMultiplier = Number(speedSelect.value);
  });

  showFpsCheck.checked = devSettings.showFpsCounter;
  showFpsCheck.addEventListener('change', () => {
    setFpsCounterEnabled(showFpsCheck.checked);
  });

  bindRenderDebugCheck('dev-hide-terrain', 'hideTerrain');
  bindRenderDebugCheck('dev-hide-water', 'hideWater');
  bindRenderDebugCheck('dev-hide-scatter', 'hideScatter');
  bindRenderDebugCheck('dev-hide-sky', 'hideSky');
  bindRenderDebugCheck('dev-hide-clouds', 'hideClouds');
  bindRenderDebugCheck('dev-disable-bloom', 'disableBloom');
  bindRenderDebugCheck('dev-disable-shadows', 'disableShadows');
  bindRenderDebugCheck('dev-disable-edge-aa', 'disableEdgeAa');
  bindRenderDebugCheck('dev-log-gpu-periodic', 'logGpuPeriodic');
  panel.querySelector('#dev-gpu-info')?.addEventListener('click', () => postFX.logGpuInfo());
  panel.querySelector('#dev-render-debug')?.addEventListener('click', () => {
    onLogRenderDebug?.();
    console.info('[RenderDebug] manual log (see frame + sky entries above)');
  });

  panel.querySelector('#dev-stones')?.addEventListener('click', () => findAllStones());

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

  const syncGrassSlider = (
    slider: HTMLInputElement | null,
    output: HTMLOutputElement | null,
    value: number,
    format: (v: number) => string,
  ) => {
    if (!slider) return;
    slider.value = String(value);
    if (output) output.textContent = format(value);
  };

  const syncGrassUi = () => {
    const g = devSettings.grass;
    syncGrassSlider(
      panel.querySelector('#dev-grass-wind-strength'),
      panel.querySelector('#dev-grass-wind-strength-out'),
      g.windStrength,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-wind-speed'),
      panel.querySelector('#dev-grass-wind-speed-out'),
      g.windSpeed,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-density'),
      panel.querySelector('#dev-grass-density-out'),
      g.densityMul,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-cover-count'),
      panel.querySelector('#dev-grass-cover-count-out'),
      g.coverCount,
      (v) => String(Math.round(v)),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-accent-count'),
      panel.querySelector('#dev-grass-accent-count-out'),
      g.accentCount,
      (v) => String(Math.round(v)),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-cover-spacing'),
      panel.querySelector('#dev-grass-cover-spacing-out'),
      g.coverMinSpacing,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-accent-spacing'),
      panel.querySelector('#dev-grass-accent-spacing-out'),
      g.accentMinSpacing,
      (v) => v.toFixed(1),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-cover-hmin'),
      panel.querySelector('#dev-grass-cover-hmin-out'),
      g.coverHeightMin,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-cover-hmax'),
      panel.querySelector('#dev-grass-cover-hmax-out'),
      g.coverHeightMax,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-accent-hmin'),
      panel.querySelector('#dev-grass-accent-hmin-out'),
      g.accentHeightMin,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-accent-hmax'),
      panel.querySelector('#dev-grass-accent-hmax-out'),
      g.accentHeightMax,
      (v) => v.toFixed(2),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-cover-smin'),
      panel.querySelector('#dev-grass-cover-smin-out'),
      g.coverScaleMin,
      (v) => v.toFixed(1),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-cover-smax'),
      panel.querySelector('#dev-grass-cover-smax-out'),
      g.coverScaleMax,
      (v) => v.toFixed(1),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-accent-smin'),
      panel.querySelector('#dev-grass-accent-smin-out'),
      g.accentScaleMin,
      (v) => v.toFixed(1),
    );
    syncGrassSlider(
      panel.querySelector('#dev-grass-accent-smax'),
      panel.querySelector('#dev-grass-accent-smax-out'),
      g.accentScaleMax,
      (v) => v.toFixed(1),
    );
  };

  const grassSection = panel.querySelector('#dev-section-grass');
  const grassWindStrengthSlider = panel.querySelector('#dev-grass-wind-strength') as HTMLInputElement | null;

  if (terrainCtx?.scatterer && grassWindStrengthSlider) {
    const g = devSettings.grass;
    g.windStrength = PHASE0.GRASS.WIND_STRENGTH;
    g.windSpeed = PHASE0.GRASS.WIND_SPEED;
    syncGrassUi();

    const markGrassDirty = () => {
      devSettings.grass.dirty = true;
    };

    const bindGrassScatter = (
      id: string,
      outId: string,
      format: (v: number) => string,
      apply: (v: number) => void,
    ) => {
      const slider = panel.querySelector(`#${id}`) as HTMLInputElement | null;
      const output = panel.querySelector(`#${outId}`) as HTMLOutputElement | null;
      if (!slider) return;
      slider.addEventListener('input', () => {
        if (output) output.textContent = format(Number(slider.value));
      });
      slider.addEventListener('change', () => {
        const v = Number(slider.value);
        if (output) output.textContent = format(v);
        apply(v);
        markGrassDirty();
      });
    };

    grassWindStrengthSlider.addEventListener('input', () => {
      g.windStrength = Number(grassWindStrengthSlider.value);
      applyGrassDevUniforms();
      syncGrassUi();
    });
    panel.querySelector('#dev-grass-wind-speed')?.addEventListener('input', () => {
      g.windSpeed = Number((panel.querySelector('#dev-grass-wind-speed') as HTMLInputElement).value);
      applyGrassDevUniforms();
      syncGrassUi();
    });
    bindGrassScatter('dev-grass-density', 'dev-grass-density-out', (v) => v.toFixed(2), (v) => {
      g.densityMul = v;
    });
    bindGrassScatter('dev-grass-cover-count', 'dev-grass-cover-count-out', (v) => String(Math.round(v)), (v) => {
      g.coverCount = Math.round(v);
    });
    bindGrassScatter('dev-grass-accent-count', 'dev-grass-accent-count-out', (v) => String(Math.round(v)), (v) => {
      g.accentCount = Math.round(v);
    });
    bindGrassScatter('dev-grass-cover-spacing', 'dev-grass-cover-spacing-out', (v) => v.toFixed(2), (v) => {
      g.coverMinSpacing = v;
    });
    bindGrassScatter('dev-grass-accent-spacing', 'dev-grass-accent-spacing-out', (v) => v.toFixed(1), (v) => {
      g.accentMinSpacing = v;
    });
    bindGrassScatter('dev-grass-cover-hmin', 'dev-grass-cover-hmin-out', (v) => v.toFixed(2), (v) => {
      g.coverHeightMin = v;
    });
    bindGrassScatter('dev-grass-cover-hmax', 'dev-grass-cover-hmax-out', (v) => v.toFixed(2), (v) => {
      g.coverHeightMax = v;
    });
    bindGrassScatter('dev-grass-accent-hmin', 'dev-grass-accent-hmin-out', (v) => v.toFixed(2), (v) => {
      g.accentHeightMin = v;
    });
    bindGrassScatter('dev-grass-accent-hmax', 'dev-grass-accent-hmax-out', (v) => v.toFixed(2), (v) => {
      g.accentHeightMax = v;
    });
    bindGrassScatter('dev-grass-cover-smin', 'dev-grass-cover-smin-out', (v) => v.toFixed(1), (v) => {
      g.coverScaleMin = v;
    });
    bindGrassScatter('dev-grass-cover-smax', 'dev-grass-cover-smax-out', (v) => v.toFixed(1), (v) => {
      g.coverScaleMax = v;
    });
    bindGrassScatter('dev-grass-accent-smin', 'dev-grass-accent-smin-out', (v) => v.toFixed(1), (v) => {
      g.accentScaleMin = v;
    });
    bindGrassScatter('dev-grass-accent-smax', 'dev-grass-accent-smax-out', (v) => v.toFixed(1), (v) => {
      g.accentScaleMax = v;
    });

    panel.querySelector('#dev-grass-rebuild')?.addEventListener('click', () => {
      devSettings.grass.dirty = true;
    });
    panel.querySelector('#dev-grass-reset-scatter')?.addEventListener('click', () => {
      resetGrassScatterDev(g);
      markGrassDirty();
      syncGrassUi();
    });
  } else {
    grassSection?.remove();
  }

  if (terrainCtx && texRepeatSlider) {
    texRepeatSlider.addEventListener('input', () => {
      devSettings.terrain.textureRepeat = Number(texRepeatSlider.value);
      markTerrainDirty();
      syncTerrainUi();
    });
    texDispOn?.addEventListener('change', () => {
      devSettings.terrain.displacementEnabled = texDispOn.checked;
      markTerrainDirty();
      syncTerrainUi();
    });
    texDispSlider?.addEventListener('input', () => {
      devSettings.terrain.displacementScale = Number(texDispSlider.value);
      markTerrainDirty();
      syncTerrainUi();
    });
    texNormalSlider?.addEventListener('input', () => {
      devSettings.terrain.normalStrength = Number(texNormalSlider.value);
      markTerrainDirty();
      syncTerrainUi();
    });
    texAoSlider?.addEventListener('input', () => {
      devSettings.terrain.aoStrength = Number(texAoSlider.value);
      markTerrainDirty();
      syncTerrainUi();
    });
    texSpecSlider?.addEventListener('input', () => {
      devSettings.terrain.specularStrength = Number(texSpecSlider.value);
      markTerrainDirty();
      syncTerrainUi();
    });
    texSlopeSlider?.addEventListener('input', () => {
      devSettings.terrain.slopeRockStart = Number(texSlopeSlider.value);
      markTerrainDirty();
      syncTerrainUi();
    });
    texPathBlendSlider?.addEventListener('input', () => {
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
  } else {
    panel.querySelector('#dev-section-terrain')?.remove();
  }

  bus.on('energy:changed', syncEnergyUi);
  syncEnergyUi();

  postFX.setPixelSize(1);
  postFX.setColorLevels(1);
  syncBloomUi(postFX.getBloomParams());

  return () => {
    bus.off('energy:changed', syncEnergyUi);
  };
}
