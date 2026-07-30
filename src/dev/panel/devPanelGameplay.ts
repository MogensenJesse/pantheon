// src/dev/panel/devPanelGameplay.ts
import type { AmbientLight, DirectionalLight } from 'three';
import { PHASE0 } from '../../config/phase0';
import { bus } from '../../core/EventBus';
import { setEnergy } from '../../core/energy';
import { devSettings, state } from '../../core/GameState';
import { skipRevealSunriseIntro } from '../../core/reveal/DayCycle';
import { isDayCycleTimeFrozen, setDayCyclePaused } from '../../core/reveal/dayCycleDevScrub';
import { isEnergyCapReached } from '../../core/reveal/revealPhase';
import type { PostFXContext } from '../../rendering/PostFX';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { setFpsCounterEnabled } from '../../ui/FpsCounter';
import { bindCheckbox, mountSection } from '../bindRange';
import {
  bindDayCyclePhaseScrub,
  dayCyclePhaseScrubHtml,
  releaseSunElevationScrub,
  scrubSunElevationDeg,
  syncDayCyclePanel,
} from './sky/devPanelDayCycle';

const ENERGY_CAP = PHASE0.ENERGY_CAP;
const ENERGY_BUMP = 25;
const TEST_PRESET_ELEVATION_DEG = 33;
const TEST_PRESET_SPEED = 4;

export interface DevPanelGameplaySkyContext {
  sky: SkySystemContext;
  postFX: PostFXContext;
  sun: DirectionalLight;
  ambientLight: AmbientLight;
}

export function initDevPanelGameplay(
  panel: HTMLDivElement,
  skyCtx?: DevPanelGameplaySkyContext,
): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-gameplay',
    title: 'Gameplay',
    open: true,
    body: `
      <label class="dev-row dev-row-check">
        <span>Testing preset</span>
        <input type="checkbox" id="dev-test-preset" />
      </label>
      <p class="dev-hint">100% energy, sun 33° (skips reveal sunrise), FPS on, 4× move speed, unconstrained look up.</p>
      <label class="dev-row">
        <span>Energy</span>
        <input type="range" id="dev-energy" min="0" max="${ENERGY_CAP}" step="1" value="0" />
        <output id="dev-energy-out">0</output>
      </label>
      <div class="dev-actions">
        <button type="button" data-energy="0">0%</button>
        <button type="button" data-energy="25">25%</button>
        <button type="button" data-energy="50">50%</button>
        <button type="button" data-energy="100">100%</button>
        <button type="button" id="dev-energy-plus">+${ENERGY_BUMP}</button>
      </div>
      <label class="dev-row">
        <span>Move speed</span>
        <select id="dev-speed">
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
          <option value="8">8×</option>
        </select>
      </label>
      <label class="dev-row dev-row-check">
        <span>Unconstrained look up</span>
        <input type="checkbox" id="dev-unconstrained-camera-pitch" />
      </label>
      <p class="dev-hint">Removes the default pitch floor (~8.6°) so the orbit camera can look straight up at the sky.</p>
      ${dayCyclePhaseScrubHtml()}
      <div class="dev-actions">
        <button type="button" id="dev-day-cycle-toggle">Pause day cycle</button>
      </div>
      <p class="dev-hint">Cycle phase scrub locks the auto arc; Pause/Resume continues from the scrubbed phase. Needs 100% energy (or testing preset).</p>
    `,
  });
  if (!body) return () => {};

  const energySlider = panel.querySelector('#dev-energy') as HTMLInputElement;
  const energyOut = panel.querySelector('#dev-energy-out') as HTMLOutputElement;
  const speedSelect = panel.querySelector('#dev-speed') as HTMLSelectElement;
  const testPreset = panel.querySelector('#dev-test-preset') as HTMLInputElement | null;
  const dayCycleToggle = panel.querySelector('#dev-day-cycle-toggle') as HTMLButtonElement | null;
  const unconstrainedPitchCheckbox = panel.querySelector(
    '#dev-unconstrained-camera-pitch',
  ) as HTMLInputElement | null;
  speedSelect.value = String(devSettings.movementSpeedMultiplier);

  let testPresetSnapshot: {
    energy: number;
    movementSpeedMultiplier: number;
    showFpsCounter: boolean;
    unconstrainedCameraPitch: boolean;
  } | null = null;

  const syncDayCycleToggle = () => {
    if (!dayCycleToggle) return;
    const frozen = isDayCycleTimeFrozen();
    dayCycleToggle.textContent = frozen ? 'Resume day cycle' : 'Pause day cycle';
    dayCycleToggle.disabled = !isEnergyCapReached() && !frozen;
  };

  const syncFpsCheckbox = () => {
    const showFps = panel.querySelector('#dev-show-fps') as HTMLInputElement | null;
    if (showFps) showFps.checked = devSettings.showFpsCounter;
  };

  const syncUnconstrainedPitchCheckbox = () => {
    if (unconstrainedPitchCheckbox) {
      unconstrainedPitchCheckbox.checked = devSettings.unconstrainedCameraPitch;
    }
  };

  const applyTestPreset = (enabled: boolean) => {
    if (enabled) {
      testPresetSnapshot = {
        energy: state.energy,
        movementSpeedMultiplier: devSettings.movementSpeedMultiplier,
        showFpsCounter: devSettings.showFpsCounter,
        unconstrainedCameraPitch: devSettings.unconstrainedCameraPitch,
      };
      setEnergy(ENERGY_CAP);
      devSettings.movementSpeedMultiplier = TEST_PRESET_SPEED;
      speedSelect.value = String(TEST_PRESET_SPEED);
      setFpsCounterEnabled(true);
      devSettings.unconstrainedCameraPitch = true;
      syncFpsCheckbox();
      syncUnconstrainedPitchCheckbox();
      if (skyCtx) {
        scrubSunElevationDeg(TEST_PRESET_ELEVATION_DEG, skyCtx);
        syncDayCyclePanel(panel);
      }
      syncDayCycleToggle();
      return;
    }

    if (testPresetSnapshot) {
      setEnergy(testPresetSnapshot.energy);
      devSettings.movementSpeedMultiplier = testPresetSnapshot.movementSpeedMultiplier;
      speedSelect.value = String(testPresetSnapshot.movementSpeedMultiplier);
      setFpsCounterEnabled(testPresetSnapshot.showFpsCounter);
      devSettings.unconstrainedCameraPitch = testPresetSnapshot.unconstrainedCameraPitch;
      testPresetSnapshot = null;
    } else {
      setFpsCounterEnabled(false);
    }
    syncFpsCheckbox();
    syncUnconstrainedPitchCheckbox();
    releaseSunElevationScrub();
    syncDayCyclePanel(panel);
    syncDayCycleToggle();
  };

  const syncEnergyUi = () => {
    energySlider.value = String(state.energy);
    energyOut.textContent = String(Math.round(state.energy));
  };

  const onEnergyInput = () => {
    setEnergy(Number(energySlider.value));
    syncEnergyUi();
  };
  energySlider.addEventListener('input', onEnergyInput);

  const energyButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-energy]'));
  const buttonHandlers = energyButtons.map((btn) => {
    const handler = () => {
      setEnergy(Number(btn.dataset.energy));
      syncEnergyUi();
    };
    btn.addEventListener('click', handler);
    return { btn, handler };
  });

  const energyPlusBtn = panel.querySelector('#dev-energy-plus') as HTMLButtonElement | null;
  const onEnergyPlus = () => {
    setEnergy(state.energy + ENERGY_BUMP);
    syncEnergyUi();
  };
  energyPlusBtn?.addEventListener('click', onEnergyPlus);

  const onSpeedChange = () => {
    devSettings.movementSpeedMultiplier = Number(speedSelect.value);
  };
  speedSelect.addEventListener('change', onSpeedChange);

  const onTestPresetChange = () => {
    if (!testPreset) return;
    applyTestPreset(testPreset.checked);
  };
  testPreset?.addEventListener('change', onTestPresetChange);

  const onDayCycleToggle = () => {
    if (isDayCycleTimeFrozen()) {
      setDayCyclePaused(false);
      releaseSunElevationScrub();
      if (isEnergyCapReached()) skipRevealSunriseIntro();
      syncDayCyclePanel(panel);
    } else {
      setDayCyclePaused(true);
    }
    syncDayCycleToggle();
  };
  dayCycleToggle?.addEventListener('click', onDayCycleToggle);

  const disposePhaseScrub = skyCtx
    ? bindDayCyclePhaseScrub(panel, skyCtx, () => {
        syncDayCycleToggle();
      })
    : () => {};

  const disposeUnconstrainedPitch = bindCheckbox(
    panel,
    'dev-unconstrained-camera-pitch',
    () => devSettings.unconstrainedCameraPitch,
    (v) => {
      devSettings.unconstrainedCameraPitch = v;
    },
  );

  bus.on('energy:changed', syncEnergyUi);
  bus.on('energy:changed', syncDayCycleToggle);
  syncEnergyUi();
  syncDayCycleToggle();
  if (skyCtx) syncDayCyclePanel(panel);

  return () => {
    disposePhaseScrub();
    disposeUnconstrainedPitch();
    if (testPreset?.checked) applyTestPreset(false);
    setDayCyclePaused(false);
    bus.off('energy:changed', syncEnergyUi);
    bus.off('energy:changed', syncDayCycleToggle);
    energySlider.removeEventListener('input', onEnergyInput);
    for (const { btn, handler } of buttonHandlers) btn.removeEventListener('click', handler);
    energyPlusBtn?.removeEventListener('click', onEnergyPlus);
    speedSelect.removeEventListener('change', onSpeedChange);
    testPreset?.removeEventListener('change', onTestPresetChange);
    dayCycleToggle?.removeEventListener('click', onDayCycleToggle);
  };
}
