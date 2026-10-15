// src/ui/HUD.ts
import { bus } from '../core/EventBus';
import { state } from '../core/GameState';
import { getLayer } from './kit/layers';

let fillEl: HTMLDivElement;

class HudController {
  private readonly container: HTMLDivElement;
  private readonly updateEnergy: () => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud';
    this.container.innerHTML = `<div class="energy-bar"><div class="fill"></div></div>`;
    // Styled in kit/hud.css; the hud layer carries the z-index.
    getLayer('hud').appendChild(this.container);

    fillEl = this.container.querySelector('.fill') as HTMLDivElement;

    this.updateEnergy = () => {
      const pct = (state.energy / state.energyCap) * 100;
      fillEl.style.width = `${pct}%`;
    };

    bus.on('energy:changed', this.updateEnergy);
    this.updateEnergy();
  }

  dispose(): void {
    bus.off('energy:changed', this.updateEnergy);
    this.container.remove();
  }
}

export function initHUD(): () => void {
  const controller = new HudController();
  return () => controller.dispose();
}
