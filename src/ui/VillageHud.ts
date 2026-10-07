// src/ui/VillageHud.ts — a faint line about the village when the orb is near enough to be felt
import { state } from '../core/GameState';
import type { VillageSystemContext } from '../world/village/VillageSystem';

/** Show the line within this distance of the village centre (m). */
const SHOW_WITHIN_M = 150;
const REFRESH_MS = 250;
const PULSE_BOOST = 0.15;

class VillageHudController {
  private readonly el: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly timer: ReturnType<typeof setInterval>;
  private text = '';

  constructor(private readonly village: VillageSystemContext) {
    this.el = document.createElement('div');
    this.el.id = 'village-hud';
    this.style = document.createElement('style');
    this.style.textContent = `
    #village-hud {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 34px;
      text-align: center;
      font: 12px/1 system-ui, sans-serif;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(225, 215, 195, 0.7);
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
      opacity: 0;
      transition: opacity 0.8s ease;
      pointer-events: none;
      z-index: 50;
    }
    #village-hud.visible { opacity: 1; }
    #village-hud.pulse { color: rgba(235, 215, 255, 0.95); }
  `;
    document.head.appendChild(this.style);
    document.body.appendChild(this.el);
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
    this.refresh();
  }

  private refresh(): void {
    const { sim } = this.village;
    const near = state.phase >= 1 && this.village.playerDistance() < SHOW_WITHIN_M;
    this.el.classList.toggle('visible', near);
    if (!near) return;
    const homes = sim.buildings.filter((b) => b.stage === 2 && b.type.startsWith('house_')).length;
    const souls = sim.villagers.count;
    const text = `Village · ${souls} ${souls === 1 ? 'soul' : 'souls'} · ${homes} ${homes === 1 ? 'home' : 'homes'}`;
    if (text !== this.text) {
      this.text = text;
      this.el.textContent = text;
    }
    this.el.classList.toggle('pulse', sim.faith.boost01 > PULSE_BOOST);
  }

  dispose(): void {
    clearInterval(this.timer);
    this.el.remove();
    this.style.remove();
  }
}

export function initVillageHud(village: VillageSystemContext): () => void {
  const controller = new VillageHudController(village);
  return () => controller.dispose();
}
