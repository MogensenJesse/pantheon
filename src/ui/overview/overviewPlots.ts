// src/ui/overview/overviewPlots.ts — "Mark a place" in the village overview: a plot inside the village, an outpost beyond it
//
// Press P (or choose a type in the row that appears) and the orb carries a ring: green where the builders
// would take it, red where they would not. R turns the door of a plot, a click marks it, Esc puts the tool away.
// A plot costs what a site costs and counts against the open sites; an outpost sends a crew out to build a camp
// that keeps the village supplied. Plots open when the village has grown (`homes_10`), outposts with the first
// restored place (`first_place`). Not a sixth power: it has its own key.

import type { PerspectiveCamera } from 'three';
import type { Overview } from '../../overview/overviewController';
import type { MilestoneId } from '../../skills/milestones';
import type { VillageBuildingType } from '../../world/village/model/assetKeys';
import { PLOT_TYPES } from '../../world/village/model/buildings';
import { OUTPOST_KINDS, type OutpostKind } from '../../world/village/sim/outposts';
import type { OutpostResult, PlotResult } from '../../world/village/sim/villageSimTypes';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import {
  button,
  createContextualHud,
  getHudSlot,
  getLayer,
  h,
  isModalPanelOpen,
  isPanelOpen,
  notify,
  registerHotkey,
} from '../kit';
import { createMarkerLayer } from '../overlay';

/** The milestones that open plots and outposts. */
export const PLOT_MILESTONE: MilestoneId = 'homes_10';
export const OUTPOST_MILESTONE: MilestoneId = 'first_place';

/** A tool is a building type for a plot, or an outpost kind written `outpost:<kind>`. */
export type PlaceTool = VillageBuildingType | `outpost:${OutpostKind}`;
const OUTPOST_TOOLS: readonly PlaceTool[] = OUTPOST_KINDS.map((k) => `outpost:${k}` as const);
const outpostKindOfTool = (tool: PlaceTool): OutpostKind | null =>
  tool.startsWith('outpost:') ? (tool.slice('outpost:'.length) as OutpostKind) : null;

const PLOT_NAMES: Record<string, string> = {
  house_a: 'Small house',
  house_b: 'House',
  house_c: 'Large house',
  workshop: 'Workshop',
  granary: 'Granary',
  farmstead: 'Farmstead',
  'outpost:lumber': 'Lumber camp',
  'outpost:fishing': 'Fishing hut',
};

const REFUSALS: Record<Exclude<PlotResult, 'ok'>, string> = {
  type: 'That cannot be marked.',
  'not-converted': 'The village is not yet yours to shape.',
  full: 'The village has all the buildings it can hold.',
  cap: 'The builders already have enough sites open.',
  outside: 'That is beyond the village.',
  road: 'Too close to a road or the temple.',
  blocked: 'Something is in the way.',
  unreachable: 'The villagers could not walk there.',
  steep: 'The ground is too steep.',
  far: 'Too far from the village for the builders.',
  wood: 'Not enough wood.',
  faith: 'Not enough faith.',
};

const OUTPOST_REFUSALS: Record<Exclude<OutpostResult, 'ok'>, string> = {
  type: 'That cannot be built out here.',
  'not-converted': 'The village is not yet yours to shape.',
  inside: 'Too close to the village: mark a plot instead.',
  near: 'Too close to another outpost.',
  resource: 'Nothing to work here: a lumber camp needs trees, a fishing hut needs water.',
  limit: 'The village already holds as many outposts as it can supply.',
  'no-route': 'The builders could find no way there.',
  'no-crew': 'There are not enough free builders to send.',
  wood: 'Not enough wood.',
  faith: 'Not enough faith.',
};

export const plotRefusalText = (result: Exclude<PlotResult, 'ok'>): string => REFUSALS[result];
export const outpostRefusalText = (result: Exclude<OutpostResult, 'ok'>): string =>
  OUTPOST_REFUSALS[result];

export interface OverviewPlotsDeps {
  overview: Overview;
  camera: PerspectiveCamera;
  village: VillageSystemContext;
  groundY: (x: number, z: number) => number;
  /** Whether plots, and outposts, have been opened by their milestones. */
  plotsOpen: () => boolean;
  outpostsOpen: () => boolean;
}

export interface OverviewPlots {
  /** The tool in hand, or null when it is away. */
  armed: () => PlaceTool | null;
  arm: (tool: PlaceTool | null) => void;
  dispose: () => void;
}

/** How far the door marker sits from the ring's middle (m). */
const DOOR_OFFSET_M = 3.2;
const RING_M = 7;

export function createOverviewPlots(deps: OverviewPlotsDeps): OverviewPlots {
  const { overview, camera, village, groundY } = deps;
  const { sim } = village;
  let armed: PlaceTool | null = null;
  /** Quarter turns added to the default facing. */
  let turns = 0;

  const rings = createMarkerLayer(camera, 'po-plot');

  const hint = h('p', { class: 'k-hint k-hint--accent' });
  hint.hidden = true;
  getHudSlot('hints').appendChild(hint);

  const TOOLS: readonly PlaceTool[] = [...PLOT_TYPES, ...OUTPOST_TOOLS];
  const isOutpost = (tool: PlaceTool): boolean => outpostKindOfTool(tool) !== null;
  /** What the player may use now: plots and outposts open separately. */
  const available = (tool: PlaceTool): boolean =>
    isOutpost(tool) ? deps.outpostsOpen() : deps.plotsOpen();

  const row = h('div', {
    class: 'ov-plots',
    attrs: { role: 'group', 'aria-label': 'Mark a place' },
  });
  const buttons = TOOLS.map((tool) =>
    button(PLOT_NAMES[tool] ?? tool, () => choose(tool), { class: 'ov-plots__btn' }),
  );
  row.append(h('span', { class: 'ov-plots__label', text: 'Mark a place · P' }), ...buttons);
  getLayer('hud').appendChild(row);
  const rowHud = createContextualHud(row, { base: 'hidden' });

  const facing = (x: number, z: number): number => sim.plotFacing(x, z) + (turns * Math.PI) / 2;

  const arm = (tool: PlaceTool | null) => {
    armed = tool;
    turns = 0;
    hint.hidden = tool === null;
    if (tool !== null) {
      const name = PLOT_NAMES[tool] ?? tool;
      hint.textContent = isOutpost(tool)
        ? `${name}: click a place beyond the village · Esc to put it away`
        : `${name}: click to mark · R turns the door · Esc to put it away`;
    }
  };

  const choose = (tool: PlaceTool) => {
    if (overview.phase() !== 'overview' || !available(tool)) return;
    arm(armed === tool ? null : tool);
  };

  const place = (tool: PlaceTool): boolean => {
    const ground = overview.hoverPoint();
    if (!ground) return false;
    const name = PLOT_NAMES[tool] ?? tool;
    const kind = outpostKindOfTool(tool);
    if (kind) {
      const result = village.placeOutpost(kind, ground.x, ground.z);
      if (result === 'ok') {
        notify({ text: `${name} marked. A crew sets out.`, key: 'plot' });
        arm(null);
      } else {
        notify({ text: outpostRefusalText(result), kind: 'warning', key: 'plot-refusal' });
      }
      return true;
    }
    const result = village.placePlot(
      tool as VillageBuildingType,
      ground.x,
      ground.z,
      facing(ground.x, ground.z),
    );
    if (result === 'ok') {
      notify({ text: `${name} marked. The builders will come.`, key: 'plot' });
      arm(null);
    } else {
      notify({ text: plotRefusalText(result), kind: 'warning', key: 'plot-refusal' });
    }
    return true;
  };

  // An armed tool takes the click (a place or a refusal) ahead of the info panel's selecting.
  const offClick = overview.onClick(
    () => {
      if (armed === null || isModalPanelOpen()) return false;
      return place(armed);
    },
    { first: true },
  );

  const offEscape = overview.addEscapeGuard(() => {
    if (armed === null || isPanelOpen()) return false;
    arm(null);
    return true;
  });

  const offKeys = [
    registerHotkey(
      'KeyP',
      () => {
        if (isModalPanelOpen() || overview.phase() !== 'overview') return;
        const first = TOOLS.find(available) ?? null;
        arm(armed === null ? first : null);
      },
      'Mark a place',
    ),
    registerHotkey(
      'KeyR',
      () => {
        if (armed !== null && !isOutpost(armed)) turns = (turns + 1) % 4;
      },
      'Turn the plot',
    ),
  ];

  const refresh = () => {
    const inOverview = overview.phase() === 'overview';
    const anyOpen = TOOLS.some(available);
    rowHud.setBase(inOverview && anyOpen ? 'persistent' : 'hidden');
    for (const [i, el] of buttons.entries()) {
      const tool = TOOLS[i]!;
      el.hidden = !available(tool);
      el.dataset.armed = String(armed === tool);
      el.setAttribute('aria-pressed', String(armed === tool));
    }
    if (armed !== null && !(inOverview && available(armed))) arm(null);
    rings.begin();
    const ground = armed !== null ? overview.hoverPoint() : null;
    if (armed !== null && ground) {
      const y = groundY(ground.x, ground.z);
      const kind = outpostKindOfTool(armed);
      if (kind) {
        // Cheap checks only while the orb moves; the route and the crew are looked at when it is placed.
        const ok = sim.outpostCheck(kind, ground.x, ground.z) === null;
        rings.add(ground.x, y, ground.z, RING_M).state = ok ? 'is-ok' : 'is-bad';
      } else {
        const rot = facing(ground.x, ground.z);
        const ok = sim.plotCheck(armed as VillageBuildingType, ground.x, ground.z, rot) === 'ok';
        rings.add(ground.x, y, ground.z, RING_M).state = ok ? 'is-ok' : 'is-bad';
        const door = rings.add(
          ground.x + Math.sin(rot) * DOOR_OFFSET_M,
          y,
          ground.z + Math.cos(rot) * DOOR_OFFSET_M,
          1.2,
        );
        door.state = ok ? 'is-ok' : 'is-bad';
      }
    }
    rings.flush();
  };
  const offFrame = overview.onFrame(refresh);

  return {
    armed: () => armed,
    arm,
    dispose: () => {
      offClick();
      offEscape();
      offFrame();
      for (const off of offKeys) off();
      rowHud.dispose();
      row.remove();
      hint.remove();
      rings.dispose();
    },
  };
}
