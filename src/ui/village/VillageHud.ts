// src/ui/village/VillageHud.ts — a faint line about the village when the orb is near enough to be felt
import { state } from '../../core/state/gameState';
import { isFinished, isHouse } from '../../world/village/model/buildings';
import { shortages } from '../../world/village/sim/economy';
import { stageOf } from '../../world/village/sim/hunger';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { getLayer } from '../kit/layers';
import { createContextualHud } from '../kit/visibility';
import { count, hungerLabel } from './villageText';

/** Show the line within this distance of the village centre (m). */
const SHOW_WITHIN_M = 150;
const REFRESH_MS = 250;
const PULSE_BOOST = 0.15;

class VillageHudController {
  private readonly el: HTMLDivElement;
  private readonly hud: ReturnType<typeof createContextualHud>;
  private readonly timer: ReturnType<typeof setInterval>;
  private text = '';

  constructor(
    private readonly village: VillageSystemContext,
    private readonly hidden: () => boolean,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'village-hud';
    // Styled in kit/hud.css; the hud layer carries the z-index.
    getLayer('hud').appendChild(this.el);
    this.hud = createContextualHud(this.el, { base: 'hidden' });
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
    this.refresh();
  }

  private refresh(): void {
    const { sim } = this.village;
    const near =
      state.phase >= 1 && this.village.playerDistance() < SHOW_WITHIN_M && !this.hidden();
    this.hud.setBase(near ? 'persistent' : 'hidden');
    if (!near) return;
    const homes = sim.buildings.filter((b) => isFinished(b) && isHouse(b)).length;
    const souls = sim.villagers.count;
    // Once the first villager believes, and until the village converts: how many believe.
    const believers = sim.believers();
    const converts = !sim.converted && believers > 0 ? ` · ${believers} believe` : '';
    const { stock } = sim.economy;
    const hunger = stageOf(sim.hunger, sim.economy.hungry);
    const hungry = hunger === 'fed' ? '' : ` · ${hungerLabel(hunger)}`;
    const text = `Village · ${count(souls, 'soul')} · ${count(homes, 'home')} · wood ${Math.floor(stock.wood)} · food ${Math.floor(stock.food)}${hungry}${converts}`;
    if (text !== this.text) {
      this.text = text;
      this.el.textContent = text;
    }
    this.el.classList.toggle('pulse', sim.faith.boost01 > PULSE_BOOST);
    const short = shortages(stock, souls);
    this.el.classList.toggle('warn', short.food || short.wood || hunger !== 'fed');
  }

  dispose(): void {
    clearInterval(this.timer);
    this.hud.dispose();
    this.el.remove();
  }
}

export function initVillageHud(
  village: VillageSystemContext,
  options: { hidden?: () => boolean } = {},
): () => void {
  const controller = new VillageHudController(village, options.hidden ?? (() => false));
  return () => controller.dispose();
}
