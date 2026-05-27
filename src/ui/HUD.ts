// src/ui/HUD.ts
import { bus } from '../core/EventBus';
import { state } from '../core/GameState';
import { WORLD } from '../world/WorldConfig';

let fillEl: HTMLDivElement;
let stoneEl: HTMLDivElement;

export function initHUD(): () => void {
  const container = document.createElement('div');
  container.id = 'hud';
  container.innerHTML = `
    <div class="energy-bar"><div class="fill"></div></div>
    <div class="stone-counter"></div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #hud {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 12px 24px 18px;
      pointer-events: none;
      z-index: 50;
    }
    #hud .energy-bar {
      height: 3px;
      max-width: 280px;
      margin: 0 auto;
      background: rgba(200, 190, 175, 0.15);
      border-radius: 2px;
      overflow: hidden;
    }
    #hud .energy-bar .fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, rgba(180, 160, 220, 0.5), rgba(220, 200, 255, 0.85));
      transition: width 0.4s ease;
      box-shadow: 0 0 12px rgba(180, 140, 255, 0.4);
    }
    #hud .stone-counter {
      text-align: center;
      margin-top: 8px;
      font-size: 0.75rem;
      font-style: italic;
      color: rgba(200, 190, 175, 0.45);
      opacity: 0;
      transition: opacity 0.5s ease;
    }
    #hud .stone-counter.visible {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);

  fillEl = container.querySelector('.fill') as HTMLDivElement;
  stoneEl = container.querySelector('.stone-counter') as HTMLDivElement;

  const updateEnergy = () => {
    const pct = (state.energy / state.energyCap) * 100;
    fillEl.style.width = `${pct}%`;
  };

  const updateStones = () => {
    if (state.stonesFound.size === 0) return;
    stoneEl.textContent = `${state.stonesFound.size} / ${WORLD.LANDMARKS.stones.length}`;
    stoneEl.classList.add('visible');
  };

  bus.on('energy:changed', updateEnergy);
  bus.on('stone:touched', updateStones);
  updateEnergy();

  return () => {
    bus.off('energy:changed', updateEnergy);
    bus.off('stone:touched', updateStones);
    container.remove();
    style.remove();
  };
}
