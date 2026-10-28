// src/dev/panel/devPanelHand.ts — DEV the orb's hand: how a carried thing hangs, and the numbers of reach, cost and deeds
import { VILLAGE } from '../../config/village';
import { VISUAL } from '../../config/visualTuning';
import { type ConfigGroup, mountConfigSection } from '../bindConfig';

const GROUPS: readonly ConfigGroup[] = [
  {
    title: 'Carry look',
    open: true,
    root: VISUAL.hand,
    hint: 'How a lifted thing hangs from the orb. Lift something first (<code>__pantheonHand.grab()</code>).',
    rows: [
      ['CARRY.TREE_SCALE', 'Tree scale', 0.05, 1.5, 0.01],
      ['CARRY.TILT_RAD', 'Tree tilt (rad)', 0, 2.4, 0.01],
      ['CARRY.HANG_M', 'Tree hang (m)', -1, 2, 0.01],
      ['CARRY.SHEAF_SCALE', 'Sheaf scale', 0.05, 1.5, 0.01],
      ['CARRY.SHEAF_DROP_M', 'Sheaf drop (m)', 0, 2, 0.01],
      ['CARRY.SHEEP_SCALE', 'Sheep scale', 0.1, 1.5, 0.01],
      ['CARRY.SHEEP_DROP_M', 'Sheep drop (m)', 0, 2, 0.01],
    ],
  },
  {
    title: 'Reach and cost',
    root: VILLAGE.HAND,
    hint: 'Placeholder numbers until a playtest. Read when the hand acts, so a change is live in the running village.',
    rows: [
      ['REACH_M.tree', 'Reach: tree (m)', 1, 20, 0.5, 1],
      ['REACH_M.wheat', 'Reach: field edge (m)', 1, 20, 0.5, 1],
      ['REACH_M.sheep', 'Reach: sheep (m)', 1, 20, 0.5, 1],
      ['COST.tree', 'Energy: tree', 0, 50, 1, 0],
      ['COST.wheat', 'Energy: sheaf', 0, 50, 1, 0],
      ['COST.sheep', 'Energy: sheep', 0, 50, 1, 0],
      ['WORK_PER_WOOD_S', 'Builder-seconds per wood', 1, 60, 1, 0],
      ['WHEAT.MIN_RIPE', 'Field ripe from', 0.5, 1, 0.01],
    ],
  },
  {
    title: 'Deeds',
    root: VILLAGE.HAND.DEED,
    hint: 'What the village makes of a lift and a delivery.',
    rows: [
      ['LIFT_BELIEF', 'Belief at a lift', 0, 0.5, 0.005, 3],
      ['DELIVER_BELIEF', 'Belief at a delivery', 0, 1, 0.005, 3],
      ['NEED_MUL', 'Open-need multiplier', 1, 5, 0.1, 1],
    ],
  },
];

export function initDevPanelHand(panel: HTMLDivElement): () => void {
  return mountConfigSection(panel, {
    hostId: 'dev-section-hand',
    title: 'Hand',
    idPrefix: 'dev-hand',
    root: VISUAL.hand,
    hint: 'Live edits to the config numbers; they reset on reload.',
    groups: GROUPS,
  });
}
