// src/world/village/sim/support.ts — fields and the well: the buildings that follow the village's growth
import { VILLAGE } from '../../../config/village.ts';
import type { VillageStage } from '../model/assetKeys.ts';
import type { Building, Field, FootprintOf, VillageEvent } from '../model/types.ts';
import type { FaithState } from './faith.ts';
import type { Pathfinder } from './pathfind.ts';
import type { PathNetwork } from './pathNetwork.ts';
import { type PlanContext, planField, planWell } from './planner.ts';
import { fieldOccupant, OCCUPANT, type SiteGrid, stampFootprint } from './siteGrid.ts';

export interface SupportOptions {
  grid: SiteGrid;
  pathfinder: Pathfinder;
  network: PathNetwork;
  /** Live building list (the sim appends to it). */
  buildings: readonly Building[];
  /** Live field list; new fields are appended here. */
  fields: Field[];
  faith: FaithState;
  footprintOf: FootprintOf;
  /** Planner inputs as they are right now. */
  context: () => PlanContext;
  /** Seat a building in the village. */
  place: (
    type: Building['type'],
    stage: VillageStage,
    x: number,
    z: number,
    rotY: number,
  ) => Building;
  /** Idlers take up farming when a field appears. */
  promoteFarmers: () => void;
}

export interface SupportBuildings {
  /** Pick the well's spot and keep it clear until it is dug (at founding). */
  reserveWell: () => void;
  /** Start a field or dig the well when the village has grown enough and can pay; spends faith. */
  grow: (events: VillageEvent[]) => void;
}

const { PLAN, FIELDS, WELL } = VILLAGE;

export function createSupportBuildings(o: SupportOptions): SupportBuildings {
  const { grid, pathfinder, network, buildings, fields, faith, footprintOf, context, place } = o;
  let nextFieldId = 1;
  /** Where the well will go, picked at founding and kept clear until it is dug. */
  let wellSite: ReturnType<typeof planWell> = null;

  const startField = (events: VillageEvent[]): boolean => {
    const site = planField(context());
    if (!site) return false;
    const field: Field = {
      id: nextFieldId++,
      x: site.x,
      z: site.z,
      rotY: site.rotY,
      halfW: FIELDS.WIDTH_M / 2,
      halfD: FIELDS.DEPTH_M / 2,
      growth: 0,
      tenders: 0,
    };
    fields.push(field);
    stampFootprint(
      grid,
      fieldOccupant(field.id),
      field.x,
      field.z,
      field.rotY,
      field.halfW,
      field.halfD,
      PLAN.SPACING_M,
    );
    pathfinder.blockRect(field.x, field.z, field.rotY, field.halfW, field.halfD, 0.4);
    network.linkField(field);
    events.push({ kind: 'fieldStarted', field });
    o.promoteFarmers();
    return true;
  };

  const reserveWell = () => {
    wellSite = planWell(context(), footprintOf('well'));
    if (!wellSite) return;
    const [w, d] = footprintOf('well');
    stampFootprint(
      grid,
      OCCUPANT.WELL,
      wellSite.x,
      wellSite.z,
      wellSite.rotY,
      w / 2,
      d / 2,
      PLAN.SPACING_M,
    );
  };

  /** The well is dug at once (no building stages): it appears finished on the plaza edge. */
  const startWell = (events: VillageEvent[]): boolean => {
    if (buildings.some((b) => b.type === 'well')) return false;
    if (!wellSite) reserveWell();
    const site = wellSite;
    if (!site) return false;
    events.push({ kind: 'siteStarted', building: place('well', 2, site.x, site.z, site.rotY) });
    return true;
  };

  return {
    reserveWell,
    grow: (events) => {
      const houses = buildings.filter((b) => b.type.startsWith('house_')).length;
      const wantedFields = Math.min(FIELDS.MAX, Math.floor(houses / FIELDS.HOUSES_PER_FIELD));
      if (fields.length < wantedFields && faith.faith >= FIELDS.COST && startField(events)) {
        faith.faith -= FIELDS.COST;
      }
      if (houses >= WELL.HOUSES_NEEDED && faith.faith >= WELL.COST && startWell(events)) {
        faith.faith -= WELL.COST;
      }
    },
  };
}
