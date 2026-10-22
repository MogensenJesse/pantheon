// src/gameplay/finaleView.ts — the last night on screen: a beam rising from each place of power, the rune over the temple
// and the cutscene that lights them one by one (the timeline is `quests/finaleTimeline.ts`)
//
// Afterwards the beams and the rune stay as a faint mark of the name that returned (also after a load).
// Nothing is built until it is needed: when the cutscene starts, or when the name has already returned.

import { Group, type Object3D, Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import { FINALE_VISUAL } from '../config/visual/finale';
import type { Cinematic, CinematicScript } from '../core/cinematic';
import type { LandmarkPlace } from '../landmarks/landmarks';
import type { LandmarkKind } from '../map/MapTypes';
import {
  buildFinaleTimeline,
  type FinaleFrame,
  type FinaleTimeline,
} from '../quests/finaleTimeline';
import { createHint, type Hint, keycap } from '../ui/kit/hint';
import { registerHotkey } from '../ui/kit/hotkeys';
import { type CrownBeam, createCrownBeam } from '../world/village/render/crownBeam';
import { createFinaleRune, type FinaleRune } from '../world/village/render/finaleRune';

const C = PHASE0.QUEST.FINALE.CUTSCENE;
const { DARK, SETTLE_RATE } = FINALE_VISUAL;

export interface FinaleViewDeps {
  parent: Object3D;
  cinematic: Cinematic;
  /** Takes the player out of the overview before the cutscene starts. */
  closeOverview: () => void;
  /** Holds the mouse look while the cutscene plays. */
  setLookBlocked: (blocked: boolean) => void;
  /** Where the camera is, for turning the rune to face it. */
  cameraPosition: () => Vector3;
  places: readonly LandmarkPlace[];
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

/** A place of power's share of the scene: its beam, and how lit its beam and its stroke of the rune are (0..1). */
interface Slot {
  kind: LandmarkKind;
  base: Vector3;
  beam: CrownBeam;
  beamLevel: number;
  strokeLevel: number;
}

/** What is built once it is needed: the beams, the rune and how lit they are. */
interface Scene {
  group: Group;
  slots: Slot[];
  rune: FinaleRune;
  /** The whole rune's glow. */
  glow: number;
}

/** `from` moved toward `to` by at most `step`. */
const toward = (from: number, to: number, step: number) =>
  from < to ? Math.min(to, from + step) : Math.max(to, from - step);

export function createFinaleView(deps: FinaleViewDeps): FinaleView {
  const { cinematic, places, temple, groundY } = deps;

  let scene: Scene | null = null;
  const buildScene = (): Scene => {
    const group = new Group();
    group.name = 'finaleView';
    deps.parent.add(group);
    const rune = createFinaleRune(
      group,
      places.map((p) => p.kind),
    );
    rune.place(temple.x, groundY(temple.x, temple.z) + C.RUNE_HEIGHT_M, temple.z, C.RUNE_SIZE_M);
    const slots = places.map(
      (p): Slot => ({
        kind: p.kind,
        base: new Vector3(p.x, groundY(p.x, p.z), p.z),
        beam: createCrownBeam(group),
        beamLevel: 0,
        strokeLevel: 0,
      }),
    );
    return { group, slots, rune, glow: 0 };
  };
  const sceneOf = () => {
    scene ??= buildScene();
    return scene;
  };

  /**
   * Draws the levels. The beams and strokes are only touched when they changed; the rune turns to the camera
   * every frame it is shown. A beam or the rune that is dark is hidden.
   */
  const draw = (s: Scene, levelsChanged: boolean) => {
    if (levelsChanged) {
      for (const slot of s.slots) {
        const lit = slot.beamLevel > DARK;
        slot.beam.setVisible(lit);
        if (lit) slot.beam.update(slot.base, slot.beamLevel);
        s.rune.setStroke(slot.kind, slot.strokeLevel);
      }
      s.rune.setGlow(s.glow);
      s.rune.setVisible(s.glow > DARK);
    }
    if (s.glow > DARK) {
      const cam = deps.cameraPosition();
      s.rune.faceTowards(cam.x, cam.z);
    }
  };

  const showFrame = (s: Scene, f: FinaleFrame) => {
    for (const slot of s.slots) {
      slot.beamLevel = f.beams[slot.kind] ?? 0;
      slot.strokeLevel = f.strokes[slot.kind] ?? 0;
    }
    s.glow = f.glow;
    draw(s, true);
  };

  // Out of the cutscene the levels ease to rest: faint once the name has returned, dark before. Until there
  // is a reason to build the scene (the name returned, or a cutscene played) there is nothing to do.
  const offFrame = cinematic.onFrame((dt) => {
    if (cinematic.isPlaying()) return;
    const returned = deps.nameReturned();
    if (!scene && !returned) return;
    const s = sceneOf();
    const step = SETTLE_RATE * dt;
    const beamRest = returned ? C.BEAM_SETTLED : 0;
    const strokeRest = returned ? 1 : 0;
    let changed = false;
    for (const slot of s.slots) {
      const beam = toward(slot.beamLevel, beamRest, step);
      const stroke = toward(slot.strokeLevel, strokeRest, step);
      changed ||= beam !== slot.beamLevel || stroke !== slot.strokeLevel;
      slot.beamLevel = beam;
      slot.strokeLevel = stroke;
    }
    const glow = toward(s.glow, returned ? C.RUNE_SETTLED : 0, step);
    changed ||= glow !== s.glow;
    s.glow = glow;
    draw(s, changed);
  });

  let timeline: FinaleTimeline | null = null;
  let hint: Hint | null = null;
  /** Set while the cutscene plays: lets go of the keys and the mouse look. */
  let release: (() => void) | null = null;

  /** The script reads the timeline twice a frame (the view, then the scene): the second read reuses the first. */
  const scriptFor = (s: Scene): CinematicScript => {
    timeline ??= buildFinaleTimeline(places, temple);
    const tl = timeline;
    let at = Number.NaN;
    let frame: FinaleFrame | null = null;
    const frameAt = (t: number): FinaleFrame => {
      if (frame && t === at) return frame;
      at = t;
      frame = tl.at(t);
      return frame;
    };
    return {
      duration: tl.duration,
      view: (t) => frameAt(t).view,
      onFrame: (t) => showFrame(s, frameAt(t)),
    };
  };

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
      if (!cinematic.start(scriptFor(sceneOf()), end)) {
        end();
        return;
      }
      hint.show(true);
    },
    dispose: () => {
      release?.();
      offFrame();
      hint?.dispose();
      if (scene) {
        for (const slot of scene.slots) slot.beam.dispose();
        scene.rune.dispose();
        deps.parent.remove(scene.group);
        scene = null;
      }
    },
  };
}
