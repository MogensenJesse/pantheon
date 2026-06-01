// src/ui/dev/devPanelGameplay.ts
import { PHASE0 } from '../../config/phase0';
import { bus } from '../../core/EventBus';
import { discoverAllStones, setEnergy } from '../../core/energy';
import { devSettings, state } from '../../core/GameState';
import { mountSection } from './bindRange';

const ENERGY_CAP = PHASE0.ENERGY_CAP;
const ENERGY_BUMP = 25;

export function initDevPanelGameplay(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-gameplay',
    title: 'Gameplay',
    open: true,
    body: `
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
      <div class="dev-actions">
        <button type="button" id="dev-stones">All standing stones</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const energySlider = panel.querySelector('#dev-energy') as HTMLInputElement;
  const energyOut = panel.querySelector('#dev-energy-out') as HTMLOutputElement;
  const speedSelect = panel.querySelector('#dev-speed') as HTMLSelectElement;
  speedSelect.value = String(devSettings.movementSpeedMultiplier);

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

  const stonesBtn = panel.querySelector('#dev-stones') as HTMLButtonElement | null;
  const onStonesClick = () => discoverAllStones();
  stonesBtn?.addEventListener('click', onStonesClick);

  bus.on('energy:changed', syncEnergyUi);
  syncEnergyUi();

  return () => {
    bus.off('energy:changed', syncEnergyUi);
    energySlider.removeEventListener('input', onEnergyInput);
    for (const { btn, handler } of buttonHandlers) btn.removeEventListener('click', handler);
    energyPlusBtn?.removeEventListener('click', onEnergyPlus);
    speedSelect.removeEventListener('change', onSpeedChange);
    stonesBtn?.removeEventListener('click', onStonesClick);
  };
}
