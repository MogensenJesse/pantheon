// src/ui/overview/overviewPlots.ts — marking a plot for a building from the village overview
//
// Press P (or choose a type in the row that appears) and the orb carries a ring: green where the builders
// would take the plot, red where they would not. R turns the door, a click marks it, Esc puts the tool away.
// A plot costs what a site costs and counts against the open sites; the village builds it like any other.
// Marking opens when the village has grown (the `homes_10` milestone). Not a sixth power: it has its own key.

import type { PerspectiveCamera } from 'three';
import type { Overview } from '../../overview/overviewController';
import type { MilestoneId } from '../../skills/milestones';
import type { VillageBuildingType } from '../../world/village/model/assetKeys';
import { PLOT_TYPES } from '../../world/village/model/buildings';
import type { PlotResult } from '../../world/village/sim/villageSimTypes';
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

/** The milestone that opens the tool. */
export const PLOT_MILESTONE: MilestoneId = 'homes_10';

const PLOT_NAMES: Record<string, string> = {
  house_a: 'Small house',
  house_b: 'House',
  house_c: 'Large house',
  workshop: 'Workshop',
  granary: 'Granary',
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

export const plotRefusalText = (result: Exclude<PlotResult, 'ok'>): string => REFUSALS[result];

export interface OverviewPlotsDeps {
  overview: Overview;
  camera: PerspectiveCamera;
  village: VillageSystemContext;
  groundY: (x: number, z: number) => number;
  /** Whether the milestone that opens the tool has been reached. */
  unlocked: () => boolean;
}

export interface OverviewPlots {
  /** The type being marked, or null when the tool is away. */
  armed: () => VillageBuildingType | null;
  arm: (type: VillageBuildingType | null) => void;
  dispose: () => void;
}

/** How far the door marker sits from the ring's middle (m). */
const DOOR_OFFSET_M = 3.2;
const RING_M = 7;

export function createOverviewPlots(deps: OverviewPlotsDeps): OverviewPlots {
  const { overview, camera, village, groundY } = deps;
  const { sim } = village;
  let armed: VillageBuildingType | null = null;
  /** Quarter turns added to the default facing. */
  let turns = 0;

  const rings = createMarkerLayer(camera, 'po-plot');

  const hint = h('p', { class: 'k-hint k-hint--accent' });
  hint.hidden = true;
  getHudSlot('hints').appendChild(hint);

  const row = h('div', {
    class: 'ov-plots',
    attrs: { role: 'group', 'aria-label': 'Mark a plot' },
  });
  const buttons = PLOT_TYPES.map((type) =>
    button(PLOT_NAMES[type] ?? type, () => choose(type), { class: 'ov-plots__btn' }),
  );
  row.append(h('span', { class: 'ov-plots__label', text: 'Mark a plot · P' }), ...buttons);
  getLayer('hud').appendChild(row);
  const rowHud = createContextualHud(row, { base: 'hidden' });

  const facing = (x: number, z: number): number => sim.plotFacing(x, z) + (turns * Math.PI) / 2;

  const setHint = (text: string) => {
    hint.textContent = text;
  };

  const arm = (type: VillageBuildingType | null) => {
    armed = type;
    turns = 0;
    hint.hidden = type === null;
    if (type !== null) {
      setHint(`${PLOT_NAMES[type] ?? type}: click to mark · R turns the door · Esc to put it away`);
    }
  };

  const choose = (type: VillageBuildingType) => {
    if (overview.phase() !== 'overview' || !deps.unlocked()) return;
    arm(armed === type ? null : type);
  };

  const place = (type: VillageBuildingType): boolean => {
    const ground = overview.hoverPoint();
    if (!ground) return false;
    const result = village.placePlot(type, ground.x, ground.z, facing(ground.x, ground.z));
    if (result === 'ok') {
      notify({ text: `${PLOT_NAMES[type] ?? type} marked. The builders will come.`, key: 'plot' });
      arm(null);
    } else {
      notify({ text: plotRefusalText(result), kind: 'warning', key: 'plot-refusal' });
    }
    return true;
  };

  // An armed tool takes the click (a plot or a refusal) ahead of the info panel's selecting.
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
        if (isModalPanelOpen() || overview.phase() !== 'overview' || !deps.unlocked()) return;
        arm(armed === null ? (PLOT_TYPES[0] ?? null) : null);
      },
      'Mark a plot',
    ),
    registerHotkey(
      'KeyR',
      () => {
        if (armed !== null) turns = (turns + 1) % 4;
      },
      'Turn the plot',
    ),
  ];

  const refresh = () => {
    const open = overview.phase() === 'overview' && deps.unlocked();
    rowHud.setBase(open ? 'persistent' : 'hidden');
    for (const [i, el] of buttons.entries()) {
      el.dataset.armed = String(armed === PLOT_TYPES[i]);
      el.setAttribute('aria-pressed', String(armed === PLOT_TYPES[i]));
    }
    if (armed !== null && !open) arm(null);
    rings.begin();
    const ground = armed !== null ? overview.hoverPoint() : null;
    if (armed !== null && ground) {
      const rot = facing(ground.x, ground.z);
      const ok = sim.plotCheck(armed, ground.x, ground.z, rot) === 'ok';
      const y = groundY(ground.x, ground.z);
      rings.add(ground.x, y, ground.z, RING_M).state = ok ? 'is-ok' : 'is-bad';
      const door = rings.add(
        ground.x + Math.sin(rot) * DOOR_OFFSET_M,
        y,
        ground.z + Math.cos(rot) * DOOR_OFFSET_M,
        1.2,
      );
      door.state = ok ? 'is-ok' : 'is-bad';
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
