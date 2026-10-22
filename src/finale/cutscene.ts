// src/finale/cutscene.ts — the last night's cutscene: the camera script, the hint and the keys that skip it
//
// Plays the timeline (`timeline.ts`) through the camera director and dresses the scene (`scene.ts`) as it goes.
// Afterwards the beams and the rune stay as a faint mark of the name that returned (also after a load).
// Nothing is built until it is needed: when the cutscene starts, or when the name has already returned.

import type { Object3D, Vector3 } from 'three';
import type { LandmarkPlace } from '../landmarks/landmarks';
import type { Cinematic, CinematicScript } from '../rendering/cinematic';
import { createHint, type Hint, keycap } from '../ui/kit/hint';
import { registerHotkey } from '../ui/kit/hotkeys';
import { createFinaleScene, type FinaleScene } from './scene';
import { buildFinaleTimeline, type FinaleFrame, type FinaleTimeline } from './timeline';

export interface FinaleCutsceneDeps {
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

export interface FinaleCutscene {
  /** Plays the cutscene; `done` runs once when it ends or is skipped (at once when there is nothing to show). */
  play: (done: () => void) => void;
  dispose: () => void;
}

export function createFinaleCutscene(deps: FinaleCutsceneDeps): FinaleCutscene {
  const { cinematic, places, temple } = deps;

  let scene: FinaleScene | null = null;
  const sceneOf = () => {
    scene ??= createFinaleScene({
      parent: deps.parent,
      places,
      temple,
      groundY: deps.groundY,
      cameraPosition: deps.cameraPosition,
    });
    return scene;
  };

  // Out of the cutscene the scene eases to rest. Until there is a reason to build it (the name returned, or a
  // cutscene played) there is nothing to do.
  const offFrame = cinematic.onFrame((dt) => {
    if (cinematic.isPlaying()) return;
    const returned = deps.nameReturned();
    if (!scene && !returned) return;
    sceneOf().settle(dt, returned);
  });

  let timeline: FinaleTimeline | null = null;
  let hint: Hint | null = null;
  /** Set while the cutscene plays: lets go of the keys and the mouse look. */
  let release: (() => void) | null = null;

  /** The script reads the timeline twice a frame (the view, then the scene): the second read reuses the first. */
  const scriptFor = (s: FinaleScene): CinematicScript => {
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
      onFrame: (t) => s.showFrame(frameAt(t)),
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
      scene?.dispose();
      scene = null;
    },
  };
}
