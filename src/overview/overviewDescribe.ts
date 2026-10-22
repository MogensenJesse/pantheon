// src/overview/overviewDescribe.ts — what the overview's info panel says about a selected thing (pure:
// no DOM, no three, node-runnable). Plain data in, plain data out; the panel only draws it.

import { VILLAGE } from '../config/village.ts';
import { modifiers } from '../skills/modifiers.ts';
import { hungerTitle } from '../ui/village/villageText.ts';
import { bedsOf, isHouse } from '../world/village/model/buildings.ts';
import {
  Activity,
  type Building,
  type Field,
  Mode,
  Role,
  type Villagers,
} from '../world/village/model/types.ts';
import { foodPerDay } from '../world/village/sim/economy.ts';
import { stageOf } from '../world/village/sim/hunger.ts';
import { type Prayer, prayerLeftS } from '../world/village/sim/prayers.ts';
import { checkUpgrade, upgradeCost } from '../world/village/sim/upgrades.ts';
import type { VillageSim } from '../world/village/sim/villageSim.ts';
import type { Selection } from './overviewPick.ts';

export interface InfoRow {
  label: string;
  value: string;
  /** A row that names another thing (a resident): clicking it selects that. */
  target?: Selection;
}

export interface Description {
  title: string;
  subtitle?: string;
  rows: InfoRow[];
  /** A filled bar 0..1 (build progress, wheat growth, belief). */
  bar?: { label: string; value: number };
  /** Where a "Go to" button takes the view (villagers). */
  goTo?: { x: number; z: number };
  /** A button that raises a finished building to its next level. */
  upgrade?: { id: number; label: string; note: string; enabled: boolean };
}

export interface DescribeWorld {
  buildings: readonly Building[];
  fields: readonly Field[];
  villagers: Pick<
    Villagers,
    'count' | 'x' | 'z' | 'indoors' | 'role' | 'home' | 'belief' | 'activity' | 'mode' | 'dying'
  >;
  /** Villager index of the elder, or -1. */
  elder: number;
  /** Villagers who believe. */
  believers: number;
  /** Graves in the graveyard, and how hunger stands (`HungerStage`). */
  graves: number;
  hunger: 'fed' | 'empty' | 'weak' | 'dying';
  /** Wood and food in store and what the stores hold. */
  stock: { wood: number; food: number; woodCap: number; foodCap: number };
  /** Faith in hand. */
  faith: number;
  /** Open prayers. */
  prayers: readonly Prayer[];
}

/** The village sim as `DescribeWorld`: live views, read at the moment the panel or the tooltip asks. */
export function describeWorldOf(sim: VillageSim): DescribeWorld {
  return {
    get buildings() {
      return sim.buildings;
    },
    get fields() {
      return sim.fields;
    },
    get villagers() {
      return sim.villagers;
    },
    get elder() {
      return sim.elder;
    },
    get believers() {
      return sim.believers();
    },
    get graves() {
      return sim.graves.length;
    },
    get hunger() {
      return stageOf(sim.hunger, sim.economy.hungry);
    },
    get faith() {
      return sim.faith.faith;
    },
    get prayers() {
      return sim.prayers.open;
    },
    get stock() {
      const { stock } = sim.economy;
      const caps = sim.economy.caps();
      return { wood: stock.wood, food: stock.food, woodCap: caps.wood, foodCap: caps.food };
    },
  };
}

const BUILDING_NAMES: Readonly<Record<string, string>> = {
  temple: 'Temple',
  house_a: 'Small house',
  house_b: 'House',
  house_c: 'Large house',
  workshop: 'Workshop',
  granary: 'Granary',
  well: 'Well',
};

const ROLE_NAMES: Readonly<Record<number, string>> = {
  [Role.Builder]: 'Builder',
  [Role.Priest]: 'Priest',
  [Role.Idler]: 'Villager',
  [Role.Farmer]: 'Farmer',
  [Role.Woodcutter]: 'Woodcutter',
  [Role.Fisherman]: 'Fisherman',
};

const STAGE_NAMES = ['Foundation', 'Frame', 'Finished'] as const;

const buildingName = (type: string): string => BUILDING_NAMES[type] ?? type;

/** What the tooltip over a thing says. */
export function nameOf(sel: Selection, world: DescribeWorld): string | null {
  if (sel.kind === 'villager') {
    return sel.index >= 0 && sel.index < world.villagers.count
      ? villagerName(sel.index, world)
      : null;
  }
  if (sel.kind === 'field') return world.fields.some((f) => f.id === sel.id) ? 'Wheat field' : null;
  const b = world.buildings.find((x) => x.id === sel.id);
  if (!b) return null;
  return b.stage < 2 ? `${buildingName(b.type)} (building)` : buildingName(b.type);
}

const villagerName = (i: number, world: Pick<DescribeWorld, 'elder'>): string =>
  i === world.elder ? 'The elder' : `Villager ${i + 1}`;

const pct = (v: number): string => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

/** A villager's doing, in a word or two. */
export function activityText(i: number, v: DescribeWorld['villagers']): string {
  if (v.dying[i]! > 0) return 'Dying';
  if (v.indoors[i]) {
    switch (v.activity[i]) {
      case Activity.Sleep:
        return 'Sleeping';
      case Activity.Eat:
        return 'Eating';
      case Activity.Shelter:
        return 'At home';
      default:
        return 'Indoors';
    }
  }
  const mode = v.mode[i];
  if (mode === Mode.Walking || mode === Mode.Entering || mode === Mode.Pending) return 'Walking';
  if (mode === Mode.Acting) {
    switch (v.activity[i]) {
      case Activity.Pray:
        return 'Praying';
      case Activity.Mourn:
        return 'Mourning';
      case Activity.Eat:
        return 'Eating';
      case Activity.Work:
        switch (v.role[i]) {
          case Role.Builder:
            return 'Building';
          case Role.Farmer:
            return 'Farming';
          case Role.Woodcutter:
            return 'Chopping wood';
          case Role.Fisherman:
            return 'Fishing';
          default:
            return 'Working';
        }
      default:
        return 'Resting';
    }
  }
  return 'Wandering';
}

const beliefText = (belief: number): string => (belief >= 1 ? 'Believes' : pct(belief));

const PRAYER_NEEDS: Readonly<Record<Prayer['kind'], string>> = {
  food: 'food',
  rain: 'rain',
  shelter: 'a roof',
};

/** What a villager prays for and how long the village has to answer. */
export function prayerText(prayer: Prayer): string {
  const hours = Math.ceil((prayerLeftS(prayer) / VILLAGE.ECONOMY.DAY_S) * 24);
  return `${PRAYER_NEEDS[prayer.kind]} · ${hours} h left`;
}

function describeVillager(i: number, world: DescribeWorld): Description | null {
  const v = world.villagers;
  if (i < 0 || i >= v.count) return null;
  const home = world.buildings.find((b) => b.id === v.home[i]);
  const rows: InfoRow[] = [
    { label: 'Doing', value: activityText(i, v) },
    { label: 'Belief', value: beliefText(v.belief[i]!) },
  ];
  const prayer = world.prayers.find((x) => x.villager === i);
  if (prayer) rows.push({ label: 'Prays', value: prayerText(prayer) });
  if (home) {
    rows.push({
      label: 'Home',
      value: buildingName(home.type),
      target: { kind: 'building', id: home.id },
    });
  }
  return {
    title: villagerName(i, world),
    subtitle: ROLE_NAMES[v.role[i]!] ?? 'Villager',
    rows,
    bar: { label: 'Belief', value: v.belief[i]! },
    goTo: { x: v.x[i]!, z: v.z[i]! },
  };
}

/** Builder-seconds of a building's work done, as a share of what it takes to finish it. */
export function buildProgress(b: Building): number {
  const [a, c] = VILLAGE.CONSTRUCTION.WORK_S as readonly [number, number];
  const total = a + c;
  if (b.stage >= 2) return 1;
  const done = (b.stage === 0 ? 0 : a) + b.progress;
  return Math.max(0, Math.min(1, done / total));
}

/** The level rows, the work bar or the button of a finished building that can be raised; empty for others. */
function upgradeParts(
  b: Building,
  world: DescribeWorld,
): Pick<Description, 'bar' | 'upgrade'> & { rows: InfoRow[]; subtitle?: string } {
  const none = { rows: [] as InfoRow[] };
  const tiers = { houseTier: modifiers.houseTier, storeTier: modifiers.storeTier };
  const check = checkUpgrade(b, tiers);
  if (!check.ok && check.reason === 'unsupported') return none;
  const level: InfoRow = { label: 'Level', value: `${b.level} of ${VILLAGE.UPGRADES.MAX_LEVEL}` };
  if (b.upgrade > 0) {
    const total = upgradeCost({ type: b.type, level: b.level }).workS;
    return {
      rows: [level],
      subtitle: `Being raised to level ${b.level + 1}`,
      bar: { label: 'Raised', value: Math.max(0, Math.min(1, 1 - b.upgrade / total)) },
    };
  }
  if (!check.ok) {
    const value = check.reason === 'tier' ? 'needs a skill' : '';
    return { rows: check.reason === 'maxed' ? [level] : [level, { label: 'Next level', value }] };
  }
  const cost = upgradeCost(b);
  const busy = world.buildings.filter((x) => x.upgrade > 0).length >= VILLAGE.UPGRADES.MAX_ACTIVE;
  const affordable = world.stock.wood >= cost.wood && world.faith >= cost.faith;
  return {
    rows: [level],
    upgrade: {
      id: b.id,
      label: `Raise to level ${b.level + 1}`,
      note: busy
        ? 'The builders are busy with other upgrades'
        : `${cost.wood} wood and ${cost.faith} faith`,
      enabled: affordable && !busy,
    },
  };
}

function describeBuilding(id: number, world: DescribeWorld): Description | null {
  const b = world.buildings.find((x) => x.id === id);
  if (!b) return null;
  const name = buildingName(b.type);
  if (b.stage < 2) {
    return {
      title: name,
      subtitle: 'Being built',
      rows: [{ label: 'Stage', value: STAGE_NAMES[b.stage] ?? '' }],
      bar: { label: 'Built', value: buildProgress(b) },
      goTo: { x: b.x, z: b.z },
    };
  }
  const v = world.villagers;
  const residents: InfoRow[] = [];
  for (let i = 0; i < v.count; i++) {
    if (v.home[i] === b.id) {
      residents.push({
        label: villagerName(i, world),
        value: activityText(i, v),
        target: { kind: 'villager', index: i },
      });
    }
  }
  const beds = bedsOf(b, modifiers.bedsPerHouseAdd);
  const { stock } = world;
  if (b.type === 'temple') {
    return {
      title: name,
      subtitle: 'The village believes',
      rows: [
        { label: 'Believers', value: `${world.believers} of ${v.count}` },
        { label: 'Food', value: `${Math.floor(stock.food)} of ${stock.foodCap}` },
        { label: 'Wood', value: `${Math.floor(stock.wood)} of ${stock.woodCap}` },
        ...(world.hunger === 'fed' ? [] : [{ label: 'Hunger', value: hungerTitle(world.hunger) }]),
        { label: 'Graves', value: String(world.graves) },
        { label: 'Beds', value: `${residents.length} of ${beds} used` },
        ...residents,
      ],
      goTo: { x: b.x, z: b.z },
    };
  }
  const up = upgradeParts(b, world);
  if (isHouse(b)) {
    return {
      title: name,
      subtitle: up.subtitle ?? (beds > 0 ? `${residents.length} of ${beds} beds used` : undefined),
      rows: [
        ...up.rows,
        ...(residents.length > 0 ? residents : [{ label: 'Nobody lives here', value: '' }]),
      ],
      bar: up.bar,
      upgrade: up.upgrade,
      goTo: { x: b.x, z: b.z },
    };
  }
  if (b.type === 'granary') {
    return {
      title: name,
      subtitle: up.subtitle ?? 'Holds food for the village',
      rows: [
        ...up.rows,
        { label: 'Food', value: `${Math.floor(stock.food)} of ${stock.foodCap}` },
        { label: 'Eaten per day', value: String(foodPerDay(v.count)) },
      ],
      bar: up.bar ?? { label: 'Food', value: stock.foodCap > 0 ? stock.food / stock.foodCap : 0 },
      upgrade: up.upgrade,
      goTo: { x: b.x, z: b.z },
    };
  }
  if (b.type === 'workshop') {
    return {
      title: name,
      subtitle: up.subtitle ?? 'Holds wood for building',
      rows: [...up.rows, { label: 'Wood', value: `${Math.floor(stock.wood)} of ${stock.woodCap}` }],
      bar: up.bar ?? { label: 'Wood', value: stock.woodCap > 0 ? stock.wood / stock.woodCap : 0 },
      upgrade: up.upgrade,
      goTo: { x: b.x, z: b.z },
    };
  }
  return { title: name, rows: [], goTo: { x: b.x, z: b.z } };
}

function describeField(id: number, world: DescribeWorld): Description | null {
  const f = world.fields.find((x) => x.id === id);
  if (!f) return null;
  return {
    title: 'Wheat field',
    subtitle: f.growth >= 1 ? 'Ripe' : 'Growing',
    rows: [{ label: 'Tended by', value: f.tenders === 1 ? '1 farmer' : `${f.tenders} farmers` }],
    bar: { label: 'Growth', value: f.growth },
    goTo: { x: f.x, z: f.z },
  };
}

/** The panel's text for a selection; null when the thing no longer exists. */
export function describe(sel: Selection, world: DescribeWorld): Description | null {
  switch (sel.kind) {
    case 'villager':
      return describeVillager(sel.index, world);
    case 'building':
      return describeBuilding(sel.id, world);
    case 'field':
      return describeField(sel.id, world);
  }
}

/** The village's beds against its people (the chip at the top of the overview). */
export function bedSummary(
  buildings: readonly Building[],
  population: number,
): { beds: number; souls: number; full: boolean } {
  let beds = 0;
  for (const b of buildings) beds += bedsOf(b, modifiers.bedsPerHouseAdd);
  return { beds, souls: population, full: population >= beds };
}

/** Residents per building id (0 when none), for the bed pips. */
export function residentsPerBuilding(
  v: Pick<Villagers, 'count' | 'home'>,
  out: Map<number, number> = new Map(),
): Map<number, number> {
  out.clear();
  for (let i = 0; i < v.count; i++) {
    const h = v.home[i]!;
    out.set(h, (out.get(h) ?? 0) + 1);
  }
  return out;
}
