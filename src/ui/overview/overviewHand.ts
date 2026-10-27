// src/ui/overview/overviewHand.ts — the orb's hand in the village overview
//
// The overview's orb is the cursor, so the hand is a tool on the powers bar: arm it, click a tree, a ripe
// field or a sheep to lift it, click the temple, a store, a build site or a crew's camp to put it down. A click outside every
// drop zone lets nothing go (a mis-click must not cost the effort); Esc puts the held thing back and that does.
// What is held is kept across the overview toggle, so while it is held the hand takes the clicks armed or not.
// The hand itself is `src/hand/handRuntime.ts`; the toasts and the sparkles are `ui/hand/handUi.ts`.

import type { Camera } from 'three';
import type { AbilityView } from '../../abilities/abilityView';
import { costOf } from '../../hand/handRules';
import type { HandRuntime } from '../../hand/handRuntime';
import { notHereText, overviewHintEmpty, overviewHintFull } from '../../hand/handText';
import type { Place } from '../../hand/handTypes';
import { type OverviewHandWorld, overviewPlace } from '../../hand/overviewAim';
import type { Overview } from '../../overview/overviewController';
import type { Selection } from '../../overview/overviewPick';
import { newRing, targetRing, zoneRing } from '../hand/handRings';
import type { HandUi } from '../hand/handUi';
import { notify } from '../kit';
import { createMarkerLayer } from '../overlay';
import type { OverviewTool } from './overviewPowers';

export const OVERVIEW_HAND_ID = 'hand';

export interface OverviewHandDeps {
  overview: Overview;
  camera: Camera;
  runtime: HandRuntime;
  ui: HandUi;
  world: OverviewHandWorld;
  /** What is under the mouse, picked now (for a click). */
  pick: () => Selection | null;
  /** What the overview's own frame found under the mouse (for the rings, which look every frame). */
  hovered: () => Selection | null;
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
  const ring = newRing();
  /** Where the hand acts this frame; a click makes its own so that what it hands on is never reused. */
  const look = { x: 0, z: 0 };

  const placeAt = (mode: 'lift' | 'drop', pick: Selection | null, out: Place) =>
    overviewPlace(mode, pick, overview.hoverPoint(), deps.world, out);

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
          const at = placeAt('drop', deps.pick(), { x: 0, z: 0 });
          if (!at) return;
          if (runtime.zone(at)?.zone === 'none') {
            notify({ text: notHereText, kind: 'warning', key: 'hand-not-here' });
            return;
          }
          ui.putDown(at);
        } else {
          const at = placeAt('lift', deps.pick(), { x: 0, z: 0 });
          if (at) ui.lift(at);
        }
      },
      escape: () => ui.putBack(),
      frame: (live) => {
        rings.begin();
        if (live && deps.open()) {
          if (runtime.held()) {
            const at = placeAt('drop', deps.hovered(), look);
            const zone = at ? runtime.zone(at) : null;
            if (zone && zoneRing(zone, ring)) {
              rings.add(
                ring.x,
                deps.groundY(ring.x, ring.z) + ring.liftM,
                ring.z,
                ring.sizeM,
              ).state = 'is-active';
            }
          } else {
            const at = placeAt('lift', deps.hovered(), look);
            const target = at ? runtime.targetAt(at) : null;
            if (target) {
              const r = targetRing(target, ring);
              rings.add(r.x, deps.groundY(r.x, r.z) + r.liftM, r.z, r.sizeM);
            }
          }
        }
        rings.flush();
      },
    },
    dispose: () => rings.dispose(),
  };
}
