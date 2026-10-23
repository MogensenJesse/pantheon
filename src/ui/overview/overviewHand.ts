// src/ui/overview/overviewHand.ts — the orb's hand in the village overview
//
// The overview's orb is the cursor, so the hand is a tool on the powers bar: arm it, click a tree, a ripe
// field or a sheep to lift it, click the temple, a store or a build site to put it down. A click outside every
// drop zone lets nothing go (a mis-click must not cost the effort); Esc puts the held thing back and that does.
// What is held is kept across the overview toggle, so while it is held the hand takes the clicks armed or not.
// The hand itself is `src/hand/handRuntime.ts`; the toasts and the sparkles are `ui/hand/handUi.ts`.

import type { Camera } from 'three';
import type { AbilityView } from '../../abilities/abilityView';
import { VILLAGE } from '../../config/village';
import { costOf } from '../../hand/handRules';
import type { HandRuntime } from '../../hand/handRuntime';
import { notHereText, overviewHintEmpty, overviewHintFull } from '../../hand/handText';
import { type OverviewHandWorld, overviewPlace } from '../../hand/overviewAim';
import type { Overview } from '../../overview/overviewController';
import type { Selection } from '../../overview/overviewPick';
import type { HandUi } from '../hand/handUi';
import { notify } from '../kit';
import { createMarkerLayer } from '../overlay';
import type { OverviewTool } from './overviewPowers';

/** Where the hand's rings hang (m above the ground): over a tree, a field and a sheep's back. */
const TREE_RING_LIFT_M = 1.6;
const FIELD_RING_LIFT_M = 0.4;
const SHEEP_RING_LIFT_M = 0.6;
const TREE_RING_M = 2.4;
const SHEEP_RING_M = 1.4;
const BUILDING_RING_LIFT_M = 0.3;

export const OVERVIEW_HAND_ID = 'hand';

export interface OverviewHandDeps {
  overview: Overview;
  camera: Camera;
  runtime: HandRuntime;
  ui: HandUi;
  world: OverviewHandWorld;
  /** What is under the mouse (the overview's own pick). */
  pick: () => Selection | null;
  groundY: (x: number, z: number) => number;
  /** The hand is on the bar: the skill tree is open. */
  open: () => boolean;
  energy: () => number;
  /** The skill tree's factor on what a lift costs. */
  costMul: () => number;
}

export interface OverviewHand {
  tool: OverviewTool;
  dispose: () => void;
}

export function createOverviewHand(deps: OverviewHandDeps): OverviewHand {
  const { overview, runtime, ui } = deps;
  const rings = createMarkerLayer(deps.camera, 'po-ring');

  const ground = () => {
    const g = overview.hoverPoint();
    return g ? { x: g.x, z: g.z } : null;
  };
  const placeFor = (mode: 'lift' | 'drop') =>
    overviewPlace(mode, deps.pick(), ground(), deps.world);

  // The cheapest and the dearest lift, as the slot's cost.
  const costText = () => {
    const mul = deps.costMul();
    const costs = (['tree', 'wheat', 'sheep'] as const).map((k) => costOf(k, mul));
    const lo = Math.round(Math.min(...costs));
    const hi = Math.round(Math.max(...costs));
    return `${lo === hi ? lo : `${lo}–${hi}`} energy`;
  };
  const cheapest = () =>
    Math.min(...(['tree', 'wheat', 'sheep'] as const).map((k) => costOf(k, deps.costMul())));

  const view = (): AbilityView | null => {
    if (!deps.open()) return null;
    const held = runtime.held() !== null;
    const poor = !held && deps.energy() < cheapest();
    return {
      id: OVERVIEW_HAND_ID,
      name: 'Hand',
      cost: costText(),
      costIcon: 'energy',
      ready: !poor,
      cooldownFraction: 0,
      cooldownLeft: 0,
      note: poor ? 'Not enough energy' : held ? 'Full' : '',
    };
  };

  return {
    tool: {
      id: OVERVIEW_HAND_ID,
      view,
      hint: () => (runtime.held() ? overviewHintFull : overviewHintEmpty),
      busy: () => deps.open() && runtime.held() !== null,
      click: () => {
        if (runtime.held()) {
          const at = placeFor('drop');
          if (!at) return;
          if (runtime.zone(at)?.zone === 'none') {
            notify({ text: notHereText, kind: 'warning', key: 'hand-not-here' });
            return;
          }
          ui.putDown(at);
        } else {
          const at = placeFor('lift');
          if (at) ui.lift(at);
        }
      },
      escape: () => ui.putBack(),
      frame: (live) => {
        rings.begin();
        if (live && deps.open()) {
          if (runtime.held()) {
            const at = placeFor('drop');
            const zone = at ? runtime.zone(at) : null;
            if (zone && zone.zone !== 'none') {
              const b = zone.building;
              const size = 2 * Math.max(b.halfW, b.halfD) + VILLAGE.HAND.ZONE_MARGIN_M;
              rings.add(b.x, deps.groundY(b.x, b.z) + BUILDING_RING_LIFT_M, b.z, size).state =
                'is-active';
            }
          } else {
            const at = placeFor('lift');
            const target = at ? runtime.targetAt(at) : null;
            if (target) {
              const area = target.area;
              const lift = area
                ? FIELD_RING_LIFT_M
                : target.kind === 'sheep'
                  ? SHEEP_RING_LIFT_M
                  : TREE_RING_LIFT_M;
              const size = area
                ? 2 * Math.max(area.halfW, area.halfD)
                : target.kind === 'sheep'
                  ? SHEEP_RING_M
                  : TREE_RING_M;
              rings.add(target.x, deps.groundY(target.x, target.z) + lift, target.z, size);
            }
          }
        }
        rings.flush();
      },
    },
    dispose: () => rings.dispose(),
  };
}
