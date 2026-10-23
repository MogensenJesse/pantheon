// src/ui/hand/handUi.ts — the hand in the roam view: the F key, a ring on what it would lift, a ring on where
// it would be put down, a hint line, and toasts for what came of it
//
// The hand itself is `src/hand/handRuntime.ts`; this only shows it and presses its keys.

import type { Camera } from 'three';
import { VILLAGE } from '../../config/village';
import type { Delivery, DropOutcome, HandRuntime, PickOutcome } from '../../hand/handRuntime';
import {
  deliveryText,
  goneText,
  hintText,
  lostText,
  refusalText,
  releasedText,
} from '../../hand/handText';
import type { Place } from '../../hand/handTypes';
import { createHint, h, keycap, notify, registerHotkey } from '../kit';
import { createMarkerLayer } from '../overlay';

/** Metres above the ground the ring over a tree sits (about the trunk's middle), and over a field. */
const RING_LIFT_M = 1.6;
const FIELD_RING_LIFT_M = 0.4;
const TREE_RING_M = 2.4;

export interface HandUiDeps {
  runtime: HandRuntime;
  camera: Camera;
  groundY: (x: number, z: number) => number;
  /** The hand shows and answers its key: the skill tree is open and nothing else owns the orb. */
  enabled: () => boolean;
  /** Where the orb is on the ground. */
  orbPlace: () => { x: number; z: number };
  /** Told about every delivery (the bus event, the sparkles); `at` is where it was put down when that was not the orb. */
  onDelivered: (delivery: Delivery, at?: Place) => void;
  /** Key to lift and put down. */
  code?: string;
}

export interface HandUi {
  /** Once per fixed step. */
  update: (dt: number) => void;
  /** Once per drawn frame, with the orb as it is drawn. */
  frame: (dt: number, orb: { x: number; y: number; z: number }) => void;
  /** What the key does when nothing is held: lift what is in reach of `at` (the orb by default), with its toast. */
  lift: (at?: Place) => PickOutcome;
  /** What the key does while something is held: put it down at `at` (the orb by default), or let go outside every zone (with its toast). */
  putDown: (at?: Place) => DropOutcome;
  /** Puts the held thing back on purpose (the overview's Esc): the effort is lost. */
  putBack: () => boolean;
  /** The game takes the held thing away (a cutscene, the overview, the finale). */
  cancel: () => boolean;
  dispose: () => void;
}

export function initHandUi(deps: HandUiDeps): HandUi {
  const { runtime } = deps;
  const rings = createMarkerLayer(deps.camera, 'po-ring');
  const label = h('span');
  const hint = createHint([keycap('F'), ' ', label]);
  let lastText = '';

  const lift = (at?: Place): PickOutcome => {
    const r = runtime.pick(at);
    if (!r.ok) {
      const text = refusalText(r.reason);
      if (text) notify({ text, kind: 'info', key: 'hand-refused' });
    }
    return r;
  };
  const putDown = (at?: Place): DropOutcome => {
    const r = runtime.drop(at);
    if (r.kind === 'delivered') {
      deps.onDelivered(r.delivery, at);
      notify({ text: deliveryText(r.delivery), kind: 'success', key: 'hand-delivered' });
    } else if (r.kind === 'released') {
      notify({ text: releasedText, kind: 'warning', key: 'hand-released' });
    } else if (r.kind === 'gone') {
      notify({ text: goneText, kind: 'warning', key: 'hand-gone' });
    }
    return r;
  };
  const press = () => {
    if (!deps.enabled()) return;
    if (runtime.held()) putDown();
    else lift();
  };
  const offKey = registerHotkey(deps.code ?? 'KeyF', press, 'Lift or put down', {
    whenPanelOpen: false,
  });

  return {
    update: (dt) => {
      const was = runtime.held();
      const lost = runtime.update(dt);
      if (lost) {
        const text = lostText(lost, was?.kind);
        if (text) notify({ text, kind: 'info', key: 'hand-lost' });
      }
    },
    frame: (dt, orb) => {
      runtime.frame(dt, orb);
      rings.begin();
      const held = runtime.held();
      const on = deps.enabled();
      const target = on ? runtime.target() : null;
      const zone = on && held ? runtime.zone() : null;
      if (target) {
        const field = target.area;
        const lift = field ? FIELD_RING_LIFT_M : RING_LIFT_M;
        const size = field ? 2 * Math.max(field.halfW, field.halfD) : TREE_RING_M;
        rings.add(target.x, deps.groundY(target.x, target.z) + lift, target.z, size);
      }
      if (zone && zone.zone !== 'none') {
        const b = zone.building;
        const size = 2 * Math.max(b.halfW, b.halfD) + VILLAGE.HAND.ZONE_MARGIN_M;
        rings.add(b.x, deps.groundY(b.x, b.z) + 0.3, b.z, size).state = 'is-active';
      }
      rings.flush();
      const text = on ? hintText(target, held, zone) : '';
      if (text !== lastText) {
        lastText = text;
        label.textContent = text;
        hint.show(text !== '');
      }
    },
    lift,
    putDown,
    putBack: () => {
      const was = runtime.putBack();
      if (was) notify({ text: releasedText, kind: 'warning', key: 'hand-released' });
      return was;
    },
    cancel: () => runtime.cancel(),
    dispose: () => {
      runtime.cancel();
      offKey();
      rings.dispose();
      hint.dispose();
    },
  };
}
