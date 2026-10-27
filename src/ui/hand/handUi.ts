// src/ui/hand/handUi.ts — the hand in the roam view: the F key, a ring on what it would lift, a ring on where
// it would be put down, a hint line, and toasts for what came of it
//
// The hand itself is `src/hand/handRuntime.ts`; this only shows it and presses its keys.

import type { Camera } from 'three';
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
import { newRing, targetRing, zoneRing } from './handRings';

export interface HandUiDeps {
  runtime: HandRuntime;
  camera: Camera;
  groundY: (x: number, z: number) => number;
  /** The hand shows and answers its key: the skill tree is open and nothing else owns the orb. */
  enabled: () => boolean;
  /** Told about every delivery (the bus event, the sparkles); `at` is where it was put down when that was not the orb. */
  onDelivered: (delivery: Delivery, at?: Place) => void;
  /** Key to lift and put down (a `KeyboardEvent.code`; F by default). */
  code?: string;
}

const DEFAULT_CODE = 'KeyF';

/** The label of a key on a keycap: `KeyF` is F, `Digit3` is 3. */
const keyName = (code: string) => code.replace(/^(?:Key|Digit)/, '');

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
  /** The game takes the held thing away (the finale, a cutscene). */
  cancel: () => boolean;
  dispose: () => void;
}

export function initHandUi(deps: HandUiDeps): HandUi {
  const { runtime } = deps;
  const rings = createMarkerLayer(deps.camera, 'po-ring');
  const label = h('span');
  const code = deps.code ?? DEFAULT_CODE;
  const hint = createHint([keycap(keyName(code)), ' ', label]);
  const ring = newRing();
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
  const offKey = registerHotkey(code, press, 'Lift or put down', {
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
        const r = targetRing(target, ring);
        rings.add(r.x, deps.groundY(r.x, r.z) + r.liftM, r.z, r.sizeM);
      }
      if (zone && zoneRing(zone, ring)) {
        rings.add(ring.x, deps.groundY(ring.x, ring.z) + ring.liftM, ring.z, ring.sizeM).state =
          'is-active';
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
