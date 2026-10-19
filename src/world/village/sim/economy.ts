// src/world/village/sim/economy.ts — wood and food: the stock, what it can hold, who eats and what
// building costs (pure: no DOM, no three, node-runnable)

import { VILLAGE } from '../../../config/village.ts';
import { bedsOf } from '../model/buildings.ts';
import type { Building } from '../model/types.ts';

const E = VILLAGE.ECONOMY;

export interface Stock {
  wood: number;
  food: number;
}

/** Wood a building of this type costs to start (0 for a type that is not built through a site). */
export const woodCostOf = (type: string): number => E.WOOD_COST[type] ?? 0;

/** The cheapest thing a site could cost: below this much wood no site is worth planning. */
export const CHEAPEST_WOOD_COST = Math.min(...Object.values(E.WOOD_COST));

/** What the village can hold: the base, plus one granary's worth of food and one workshop's worth of wood each. */
export function capsOf(buildings: readonly Building[], out: Stock = { wood: 0, food: 0 }): Stock {
  let granaries = 0;
  let workshops = 0;
  for (const b of buildings) {
    if (b.stage < 2) continue;
    if (b.type === 'granary') granaries++;
    else if (b.type === 'workshop') workshops++;
  }
  out.food = E.BASE_CAP + granaries * E.GRANARY_FOOD_CAP;
  out.wood = E.BASE_CAP + workshops * E.WORKSHOP_WOOD_CAP;
  return out;
}

/** Food the village eats per game day for this many people. */
export const foodPerDay = (population: number): number => population * E.FOOD_PER_PERSON_DAY;

/** Why a saved stock cannot be used, or null. */
export function stockProblem(stock: unknown): string | null {
  const s = stock as Partial<Stock> | null;
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!s || !ok(s.wood) || !ok(s.food))
    return 'saved village: the wood and food stock is missing or damaged';
  return null;
}

/** What is running short: less than a day of food for everyone, less wood than the cheapest building. */
export function shortages(
  stock: Readonly<Stock>,
  population: number,
): { food: boolean; wood: boolean } {
  return { food: stock.food < foodPerDay(population), wood: stock.wood < CHEAPEST_WOOD_COST };
}

export interface Housing {
  /** Beds in finished buildings. */
  built: number;
  /** Beds in sites under construction. */
  planned: number;
  population: number;
}

/** Beds in the buildings (finished) and in the sites (still being built), against the people. */
export function housingOf(buildings: readonly Building[], population: number): Housing {
  let built = 0;
  let planned = 0;
  for (const b of buildings) {
    if (b.stage >= 2) built += bedsOf(b);
    else planned += bedsOf({ ...b, stage: 2 });
  }
  return { built, planned, population };
}

/** Share of all beds (built and planned) that nobody has yet; 0 with no beds at all. */
export function freeBedShare(h: Housing): number {
  const total = h.built + h.planned;
  return total <= 0 ? 0 : (total - h.population) / total;
}

/** Housing pressure lets a new site start: beds are running short. */
export const pressureAllowsSite = (h: Housing): boolean => freeBedShare(h) < E.PRESSURE_SHARE;

/** How many sites may be open at once: more when the beds have nearly run out. */
export const maxOpenSites = (h: Housing, base: number): number =>
  freeBedShare(h) < E.PRESSED_SHARE ? Math.max(base, E.PRESSED_MAX_SITES) : base;

export interface Economy {
  /** Live stock; read it, change it through the methods. */
  readonly stock: Readonly<Stock>;
  /** What the village can hold now (as of the last `update`). */
  caps: () => Readonly<Stock>;
  /** Once per step: refresh the caps and let `population` eat for `dt` seconds. */
  update: (dt: number, buildings: readonly Building[], population: number) => void;
  /** Add up to the cap; returns what was kept. */
  addWood: (amount: number) => number;
  addFood: (amount: number) => number;
  /** Takes the wood if there is enough. */
  spendWood: (amount: number) => boolean;
  /** Food is in the larder for at least a day of `population` people. */
  canFeed: (population: number) => boolean;
  /** The larder is empty: nobody could eat in the last step (hunger, M5). */
  readonly hungry: boolean;
  serialize: () => Stock;
}

export function createEconomy(initial: Stock = E.START): Economy {
  const stock: Stock = { wood: initial.wood, food: initial.food };
  const caps: Stock = { wood: E.BASE_CAP, food: E.BASE_CAP };
  let hungry = false;
  const add = (kind: keyof Stock, amount: number): number => {
    const room = Math.max(0, caps[kind] - stock[kind]);
    const kept = Math.min(Math.max(0, amount), room);
    stock[kind] += kept;
    return kept;
  };
  return {
    stock,
    caps: () => caps,
    update: (dt, buildings, population) => {
      capsOf(buildings, caps);
      const want = (foodPerDay(population) / E.DAY_S) * dt;
      hungry = stock.food < want;
      stock.food = Math.max(0, stock.food - want);
    },
    addWood: (amount) => add('wood', amount),
    addFood: (amount) => add('food', amount),
    spendWood: (amount) => {
      if (stock.wood < amount) return false;
      stock.wood -= amount;
      return true;
    },
    canFeed: (population) => stock.food >= foodPerDay(population),
    get hungry() {
      return hungry;
    },
    serialize: () => ({ wood: stock.wood, food: stock.food }),
  };
}
