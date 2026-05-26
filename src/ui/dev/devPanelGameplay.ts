// src/ui/dev/devPanelGameplay.ts
import { bus } from '../../core/EventBus';
import { discoverAllStones, setEnergy } from '../../core/energy';
import { devSettings, state } from '../../core/GameState';

export function initDevPanelGameplay(panel: HTMLDivElement): () => void {
  const energySlider = panel.querySelector('#dev-energy') as HTMLInputElement;
  const energyOut = panel.querySelector('#dev-energy-out') as HTMLOutputElement;
  const speedSelect = panel.querySelector('#dev-speed') as HTMLSelectElement;

  const syncEnergyUi = () => {
    energySlider.value = String(state.energy);
    energyOut.textContent = String(Math.round(state.energy));
  };

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

  speedSelect.addEventListener('change', () => {
    devSettings.movementSpeedMultiplier = Number(speedSelect.value);
  });

  panel.querySelector('#dev-stones')?.addEventListener('click', () => discoverAllStones());

  bus.on('energy:changed', syncEnergyUi);
  syncEnergyUi();

  return () => bus.off('energy:changed', syncEnergyUi);
}
