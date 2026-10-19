// src/world/village/sim/graveyard.ts — where the dead lie: a plot picked at founding, a grave per death
// (node-runnable)

import { VILLAGE } from '../../../config/village.ts';
import type { Field, Grave } from '../model/types.ts';
import { hash01, localToWorld } from './geometry.ts';
import { type PlanContext, planGraveyard, type SitePlan } from './planner.ts';
import { footprintFree, OCCUPANT, type SiteGrid, stampFootprint } from './siteGrid.ts';

const { GRAVEYARD, PLAN } = VILLAGE;

/** What a save keeps of the graveyard. */
export interface GraveyardState {
  /** The reserved plot, or null when the terrain left no room (the dead then simply fade away). */
  site: SitePlan | null;
  graves: Grave[];
}

export interface Graveyard {
  /** Pick the plot and keep it clear (at founding, after the first buildings and fields stand). */
  reserve: () => void;
  /** Lay the next grave; null when there is no plot or no room left. */
  add: () => Grave | null;
  readonly graves: readonly Grave[];
  readonly site: () => SitePlan | null;
  serialize: () => GraveyardState;
  restore: (state: GraveyardState) => void;
}

/** Why a saved graveyard cannot be used, or null. */
export function graveyardProblem(state: unknown): string | null {
  const s = state as Partial<GraveyardState> | null;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!s || !Array.isArray(s.graves) || (s.site !== null && typeof s.site !== 'object')) {
    return 'saved village: the graveyard is missing or damaged';
  }
  for (const g of s.graves) {
    if (!g || !num(g.x) || !num(g.z) || !num(g.yaw)) return 'saved village: a grave is damaged';
  }
  return null;
}

const COLUMNS = Math.max(1, Math.floor(GRAVEYARD.WIDTH_M / GRAVEYARD.PLOT_M));
const RESERVED_ROWS = Math.max(1, Math.floor(GRAVEYARD.DEPTH_M / GRAVEYARD.PLOT_M));

/** Where the n-th grave of a plot goes: rows of plots from the far end of the plot toward its near end, then on beyond it. */
export function plotAt(site: SitePlan, n: number): { x: number; z: number; row: number } {
  const col = n % COLUMNS;
  const row = Math.floor(n / COLUMNS);
  const lx = -GRAVEYARD.WIDTH_M / 2 + (col + 0.5) * GRAVEYARD.PLOT_M;
  const lz = -GRAVEYARD.DEPTH_M / 2 + (row + 0.5) * GRAVEYARD.PLOT_M;
  const [x, z] = localToWorld(site, lx, lz);
  return { x, z, row };
}

export function createGraveyard(o: {
  grid: SiteGrid;
  context: () => PlanContext;
  fields: readonly Field[];
}): Graveyard {
  const { grid } = o;
  let site: SitePlan | null = null;
  const graves: Grave[] = [];

  return {
    graves,
    site: () => site,
    reserve: () => {
      site = planGraveyard(o.context(), o.fields);
      if (!site) return;
      stampFootprint(
        grid,
        OCCUPANT.GRAVEYARD,
        site.x,
        site.z,
        site.rotY,
        GRAVEYARD.WIDTH_M / 2,
        GRAVEYARD.DEPTH_M / 2,
        PLAN.SPACING_M + 2,
      );
    },
    add: () => {
      if (!site) return null;
      const n = graves.length;
      const plot = plotAt(site, n);
      if (plot.row >= RESERVED_ROWS) {
        // Past the reserved ground: only where nothing stands, and then it is reserved too.
        if (plot.row >= RESERVED_ROWS + GRAVEYARD.EXTRA_ROWS) return null;
        if (!footprintFree(grid, plot.x, plot.z, site.rotY, 0.5, 0.5, 0.5, OCCUPANT.GRAVEYARD)) {
          return null;
        }
        stampFootprint(grid, OCCUPANT.GRAVEYARD, plot.x, plot.z, site.rotY, 0.5, 0.5, 1);
      }
      const grave: Grave = { x: plot.x, z: plot.z, yaw: site.rotY + (hash01(n + 1) - 0.5) * 0.14 };
      graves.push(grave);
      return grave;
    },
    serialize: () => ({ site: site ? { ...site } : null, graves: graves.map((g) => ({ ...g })) }),
    restore: (state) => {
      site = state.site ? { ...state.site } : null;
      graves.length = 0;
      for (const g of state.graves) graves.push({ ...g });
    },
  };
}
