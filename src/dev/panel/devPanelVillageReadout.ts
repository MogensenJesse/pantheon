// src/dev/panel/devPanelVillageReadout.ts — the village stats the DEV panel prints, as text

import { VILLAGE } from '../../config/village';
import type { VillageStats } from '../../world/village/sim/villageSim';

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** One line per topic: buildings, faith, trees, hunger, stores, people, paths, rings, planner and time. */
export function formatVillageReadout(
  s: VillageStats,
  extra: { timeScale: number; rain: number; rainForced: boolean },
): string {
  return [
    `buildings ${s.buildings}/${VILLAGE.PLAN.MAX_BUILDINGS}  finished ${s.finished}  open ${s.openSites}`,
    `faith ${s.faith.toFixed(1)}  +${s.rate.toFixed(3)}/s  boost ${s.boost01.toFixed(2)}  dwell ${s.dwell01.toFixed(2)}`,
    `trees ${s.forest.standing}/${s.forest.trees}  falling ${s.forest.falling}  stumps ${s.forest.stumps}  saplings ${s.forest.saplings}`,
    `hunger ${s.hunger}  dying ${s.dying}  graves ${s.graves}`,
    `wood ${s.wood.toFixed(0)}/${s.woodCap}  food ${s.food.toFixed(0)}/${s.foodCap}  eaten ${s.foodPerDay}/day  meals ${s.mealsServed} served, ${s.mealsMissed} missed`,
    `villagers ${s.villagers}/${s.beds} beds  fields ${s.fields}  asleep ${s.agents.asleep}  praying ${s.agents.praying}  working ${s.agents.working}  eating ${s.agents.eating}  at home ${s.agents.sheltering}  mourning ${s.agents.mourning}  other ${s.agents.wandering}`,
    `A* ${s.path.requests} calls  ${s.path.failures} failed  ${(s.path.searchMs / Math.max(1, s.path.requests)).toFixed(2)} ms avg  queue ${s.agents.pathQueue}`,
    `rings ${s.ringCounts.join('/')}  roads ${s.network.links} links  ${s.network.radials} radials  connected ${pct(s.network.connectedShare)}  on a ring road ${pct(s.network.arcShare)}  skipped ${s.network.skipped}`,
    `planner relief x${s.reliefRelax.toFixed(2)}  failed passes ${s.failedPasses}`,
    `time scale x${extra.timeScale}  rain ${extra.rain.toFixed(2)}${extra.rainForced ? ' (forced)' : ''}`,
  ].join('\n');
}
