// src/gameplay/finaleView.ts — the last night on screen: a beam rising from each place of power, the rune over the temple
// and the cutscene that lights them one by one (the timeline is `quests/finaleTimeline.ts`)
//
// Afterwards the beams and the rune stay as a faint mark of the name that returned (also after a load).

import { Group, type Object3D, Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import type { Cinematic, CinematicScript } from '../core/cinematic';
import type { LandmarkKind } from '../map/MapTypes';
import { buildFinaleTimeline, type FinaleFrame, type FinalePlace } from '../quests/finaleTimeline';
import { createHint, type Hint, keycap } from '../ui/kit/hint';
import { registerHotkey } from '../ui/kit/hotkeys';
import { type CrownBeam, createCrownBeam } from '../world/village/render/crownBeam';
import { createFinaleRune } from '../world/village/render/finaleRune';

const C = PHASE0.QUEST.FINALE.CUTSCENE;

/** How quickly the beams and the rune settle to their rest level after the cutscene (share per second). */
const SETTLE_RATE = 0.5;
/** A level below this is dark: nothing is drawn. */
const DARK = 0.002;

export interface FinaleViewDeps {
  parent: Object3D;
  cinematic: Cinematic;
  /** Takes the player out of the overview before the cutscene starts. */
  closeOverview: () => void;
  /** Holds the mouse look while the cutscene plays. */
  setLookBlocked: (blocked: boolean) => void;
  /** Where the camera is, for turning the rune to face it. */
  cameraPosition: () => Vector3;
  places: readonly FinalePlace[];
  temple: { x: number; z: number };
  groundY: (x: number, z: number) => number;
  /** The name has returned: the beams and the rune keep their faint rest level. */
  nameReturned: () => boolean;
}

export interface FinaleView {
  /** Plays the cutscene; `done` runs once when it ends or is skipped (at once when there is nothing to show). */
  play: (done: () => void) => void;
  dispose: () => void;
}

export function createFinaleView(deps: FinaleViewDeps): FinaleView {
  const { cinematic, places, temple, groundY } = deps;
  const group = new Group();
  group.name = 'finaleView';
  deps.parent.add(group);

  const beams = new Map<LandmarkKind, CrownBeam>();
  const bases = new Map<LandmarkKind, Vector3>();
  for (const p of places) {
    beams.set(p.kind, createCrownBeam(group));
    bases.set(p.kind, new Vector3(p.x, groundY(p.x, p.z), p.z));
  }
  const rune = createFinaleRune(
    group,
    places.map((p) => p.kind),
  );
  rune.place(temple.x, groundY(temple.x, temple.z) + C.RUNE_HEIGHT_M, temple.z, C.RUNE_SIZE_M);

  const beamLevel = new Map<LandmarkKind, number>(places.map((p) => [p.kind, 0]));
  const strokeLevel = new Map<LandmarkKind, number>(places.map((p) => [p.kind, 0]));
  let glow = 0;

  /** Draws the current levels; a beam or the rune that is dark is hidden. */
  const apply = () => {
    for (const [kind, beam] of beams) {
      const level = beamLevel.get(kind) ?? 0;
      beam.setVisible(level > DARK);
      if (level > DARK) beam.update(bases.get(kind) as Vector3, level);
      rune.setStroke(kind, strokeLevel.get(kind) ?? 0);
    }
    rune.setGlow(glow);
    const shown = glow > DARK;
    rune.setVisible(shown);
    if (shown) {
      const cam = deps.cameraPosition();
      rune.faceTowards(cam.x, cam.z);
    }
  };

  const showFrame = (f: FinaleFrame) => {
    for (const p of places) {
      beamLevel.set(p.kind, f.beams[p.kind] ?? 0);
      strokeLevel.set(p.kind, f.strokes[p.kind] ?? 0);
    }
    glow = f.glow;
    apply();
  };

  const toward = (from: number, to: number, dt: number) => {
    const step = SETTLE_RATE * dt;
    return from < to ? Math.min(to, from + step) : Math.max(to, from - step);
  };

  // Out of the cutscene the levels ease to rest: faint once the name has returned, dark before.
  const offFrame = cinematic.onFrame((dt) => {
    if (cinematic.isPlaying()) return;
    const returned = deps.nameReturned();
    const beamRest = returned ? C.BEAM_SETTLED : 0;
    const runeRest = returned ? C.RUNE_SETTLED : 0;
    let changed = false;
    for (const p of places) {
      const b = beamLevel.get(p.kind) ?? 0;
      const s = strokeLevel.get(p.kind) ?? 0;
      const nb = toward(b, beamRest, dt);
      const ns = toward(s, returned ? 1 : 0, dt);
      if (nb !== b || ns !== s) changed = true;
      beamLevel.set(p.kind, nb);
      strokeLevel.set(p.kind, ns);
    }
    const ng = toward(glow, runeRest, dt);
    if (ng !== glow) changed = true;
    glow = ng;
    // The rune turns with the camera even when nothing else changes.
    if (changed || glow > DARK) apply();
  });

  const timeline = buildFinaleTimeline(places, temple);
  const script: CinematicScript = {
    duration: timeline.duration,
    view: (t) => timeline.at(t).view,
    onFrame: (t) => showFrame(timeline.at(t)),
  };

  let hint: Hint | null = null;
  /** Set while the cutscene plays: lets go of the keys and the mouse look. */
  let release: (() => void) | null = null;

  return {
    play: (done) => {
      if (places.length === 0) {
        done();
        return;
      }
      // A second call while the cutscene plays leaves it alone.
      if (release) return;
      deps.closeOverview();
      hint ??= createHint(['Press ', keycap('Space'), ' to skip']);
      const skip = () => cinematic.skip();
      // Not in a panel: the pause menu's own buttons keep Space and Enter.
      const unbind = [
        registerHotkey('Space', skip, 'Skip the cutscene', { whenPanelOpen: false }),
        registerHotkey('Enter', skip, 'Skip the cutscene', { whenPanelOpen: false }),
      ];
      deps.setLookBlocked(true);
      release = () => {
        release = null;
        for (const off of unbind) off();
        deps.setLookBlocked(false);
        hint?.show(false);
      };
      const end = () => {
        release?.();
        done();
      };
      if (!cinematic.start(script, end)) {
        end();
        return;
      }
      hint.show(true);
    },
    dispose: () => {
      release?.();
      offFrame();
      hint?.dispose();
      for (const beam of beams.values()) beam.dispose();
      rune.dispose();
      deps.parent.remove(group);
    },
  };
}
