// src/world/village/sim/sitesDesk.ts — where a new site or an upgrade begins (pure, node-runnable)
//
// The planner's own pass (a site the village picks for itself), the player's plot, and the upgrades of finished
// buildings. Each one checks what it costs against the stock and the faith, and each leaves an event for the
// view. The desk holds no state: the buildings, the stock and the faith are the sim's.

import { VILLAGE } from '../../../config/village.ts';
import type { Modifiers } from '../../../skills/modifiers.ts';
import type { VillageStage } from '../model/assetKeys.ts';
import { isFinished, isHouse, PLOT_TYPES, plotTypeOpen } from '../model/buildings.ts';
import type { Building, VillageEvent } from '../model/types.ts';
import {
  CHEAPEST_WOOD_COST,
  type Economy,
  housingOf,
  maxOpenSites,
  pressureAllowsSite,
  woodCostOf,
} from './economy.ts';
import { type FaithState, siteCost } from './faith.ts';
import { type BuildingKind, type PlanContext, type planBuilding, validatePlot } from './planner.ts';
import { beginUpgrade, checkUpgrade, upgradeCost } from './upgrades.ts';
import type { PlotResult, UpgradeStart } from './villageSimTypes.ts';

const { PLAN } = VILLAGE;

export interface SitesDeskDeps {
  buildings: readonly Building[];
  /** The skills' numbers, read live. */
  mods: Modifiers;
  faith: FaithState;
  economy: Pick<Economy, 'stock' | 'spendWood'>;
  /** How many people live in the village (the beds are counted against them). */
  villagerCount: () => number;
  /** Whether the village is the player's to shape (a hamlet is not until it is converted). */
  isConverted: () => boolean;
  /** The sites and upgrades still being built. */
  openSites: () => Building[];
  /** The planner's draw of what to build next (it uses the sim's own random stream). */
  chooseKind: () => BuildingKind;
  /** A planner pass for a kind of building (null when no spot is found). */
  findSite: (kind: BuildingKind) => ReturnType<typeof planBuilding>;
  context: () => PlanContext;
  /** Seats a building and links its footpath. */
  place: (
    type: Building['type'],
    stage: VillageStage,
    x: number,
    z: number,
    rotY: number,
    ring?: number,
  ) => Building;
}

export interface SitesDesk {
  /**
   * Start a site. It costs faith and wood, and the village has to be short of beds: building runs
   * ahead of the people only as far as the wood and the housing allow. `free` (DEV) skips all three.
   */
  startSite: (events: VillageEvent[], free: boolean) => boolean;
  /**
   * What putting a building of `type` at (x, z) would come to, with no effect: the village must be converted
   * and have room for another site, the spot must hold the planner's own rules, and the wood and faith must
   * be there.
   */
  plotCheck: (type: Building['type'], x: number, z: number, rotY: number) => PlotResult;
  /** The player marks a plot: a site starts there and the builders come to it. */
  placePlot: (
    type: Building['type'],
    x: number,
    z: number,
    rotY: number,
    events: VillageEvent[],
  ) => PlotResult;
  /**
   * Begin the next upgrade of a finished building: it costs wood and faith, the tree must allow the level and
   * only `UPGRADES.MAX_ACTIVE` upgrades run at once. `free` (DEV) skips the cost and the cap.
   */
  upgradeBuilding: (id: number, events: VillageEvent[], free?: boolean) => UpgradeStart;
  /** The planner's choice: the lowest level first, houses before stores, then the oldest. No random draw. */
  nextUpgrade: () => Building | null;
}

export function createSitesDesk(deps: SitesDeskDeps): SitesDesk {
  const { buildings, mods, faith, economy, openSites, findSite, place, context } = deps;

  const buildingCap = () => Math.floor(PLAN.MAX_BUILDINGS * mods.buildingCapMul);
  const nextSiteCost = () => siteCost(buildings.filter((b) => b.type !== 'temple').length);
  const activeUpgrades = () => buildings.filter((b) => isFinished(b) && b.upgrade > 0).length;

  const startSite: SitesDesk['startSite'] = (events, free) => {
    if (buildings.length >= buildingCap()) return false;
    const open = openSites().length;
    if (free) {
      if (open >= PLAN.MAX_ACTIVE_SITES) return false;
    } else {
      const housing = housingOf(buildings, deps.villagerCount(), mods.bedsPerHouseAdd);
      if (open >= maxOpenSites(housing, PLAN.MAX_ACTIVE_SITES) || !pressureAllowsSite(housing)) {
        return false;
      }
      if (faith.faith < nextSiteCost()) return false;
      // Not even the cheapest building is affordable: nothing to plan yet.
      if (economy.stock.wood < CHEAPEST_WOOD_COST) return false;
    }
    const site = findSite(deps.chooseKind());
    if (!site) return false;
    if (!free) {
      if (!economy.spendWood(woodCostOf(site.type!))) return false;
      faith.faith -= nextSiteCost();
    }
    const building = place(site.type!, 0, site.x, site.z, site.rotY, site.ring);
    events.push({ kind: 'siteStarted', building });
    return true;
  };

  const plotCheck: SitesDesk['plotCheck'] = (type, x, z, rotY) => {
    if (!PLOT_TYPES.includes(type)) return 'type';
    if (!deps.isConverted()) return 'not-converted';
    if (!plotTypeOpen(type, mods)) return 'locked';
    if (buildings.length >= buildingCap()) return 'full';
    if (openSites().length >= PLAN.MAX_ACTIVE_SITES) return 'cap';
    const spot = validatePlot(context(), type, x, z, rotY);
    if (!spot.ok) return spot.reason;
    if (economy.stock.wood < woodCostOf(type)) return 'wood';
    if (faith.faith < nextSiteCost()) return 'faith';
    return 'ok';
  };

  const placePlot: SitesDesk['placePlot'] = (type, x, z, rotY, events) => {
    const result = plotCheck(type, x, z, rotY);
    if (result !== 'ok') return result;
    const spot = validatePlot(context(), type, x, z, rotY);
    economy.spendWood(woodCostOf(type));
    faith.faith -= nextSiteCost();
    const ring = spot.ok ? spot.ring : -1;
    events.push({ kind: 'siteStarted', building: place(type, 0, x, z, rotY, ring) });
    return 'ok';
  };

  const upgradeBuilding: SitesDesk['upgradeBuilding'] = (id, events, free = false) => {
    const b = buildings.find((x) => x.id === id);
    if (!b) return 'unsupported';
    const check = checkUpgrade(b, mods);
    if (!check.ok) return check.reason;
    if (!free) {
      if (activeUpgrades() >= VILLAGE.UPGRADES.MAX_ACTIVE) return 'cap';
      const cost = upgradeCost(b);
      if (faith.faith < cost.faith) return 'faith';
      if (economy.stock.wood < cost.wood) return 'wood';
      economy.spendWood(cost.wood);
      faith.faith -= cost.faith;
    }
    beginUpgrade(b);
    events.push({ kind: 'upgradeStarted', building: b });
    return 'ok';
  };

  const nextUpgrade: SitesDesk['nextUpgrade'] = () => {
    let best: Building | null = null;
    for (const b of buildings) {
      if (!checkUpgrade(b, mods).ok) continue;
      if (
        !best ||
        b.level < best.level ||
        (b.level === best.level && Number(isHouse(best)) < Number(isHouse(b)))
      ) {
        best = b;
      }
    }
    return best;
  };

  return { startSite, plotCheck, placePlot, upgradeBuilding, nextUpgrade };
}
