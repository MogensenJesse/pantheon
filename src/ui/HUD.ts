// src/ui/HUD.ts
import { bus } from '../core/EventBus';
import { state } from '../core/GameState';
import { getLayer } from './kit/layers';

let fillEl: HTMLDivElement;
let regenEl: HTMLSpanElement;

class HudController {
  private readonly container: HTMLDivElement;
  private readonly updateEnergy: () => void;
  private readonly updateRegen: (payload: { perSec: number }) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud';
    this.container.innerHTML = `<div class="energy-bar"><div class="fill"></div></div><span class="energy-regen" hidden></span>`;
    // Styled in kit/hud.css; the hud layer carries the z-index.
    getLayer('hud').appendChild(this.container);

    fillEl = this.container.querySelector('.fill') as HTMLDivElement;
    regenEl = this.container.querySelector('.energy-regen') as HTMLSpanElement;

    this.updateEnergy = () => {
      const pct = (state.energy / state.energyCap) * 100;
      fillEl.style.width = `${pct}%`;
    };

    // A quiet "+0.5/s" beside the bar while energy is coming back.
    this.updateRegen = ({ perSec }) => {
      regenEl.hidden = perSec <= 0;
      regenEl.textContent = perSec > 0 ? `+${perSec.toFixed(perSec >= 0.1 ? 1 : 2)}/s` : '';
    };

    bus.on('energy:changed', this.updateEnergy);
    bus.on('energy:regen', this.updateRegen);
    this.updateEnergy();
  }

  dispose(): void {
    bus.off('energy:changed', this.updateEnergy);
    bus.off('energy:regen', this.updateRegen);
    this.container.remove();
  }
}

export function initHUD(): () => void {
  const controller = new HudController();
  return () => controller.dispose();
}
