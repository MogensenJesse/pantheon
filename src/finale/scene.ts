// src/finale/scene.ts — what hangs over the village on the last night: a beam rising from each place of power and
// the rune over the temple, and how lit they are
//
// The cutscene sets the levels frame by frame (`showFrame`); out of it they ease to rest (`settle`): a faint mark
// of the name that returned, or dark before. Beams and strokes are only touched when their level changed.

import { Group, type Object3D, Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import { FINALE_VISUAL } from '../config/visual/finale';
import type { LandmarkPlace } from '../landmarks/landmarks';
import type { LandmarkKind } from '../map/MapTypes';
import { type CrownBeam, createCrownBeam } from '../world/village/render/crownBeam';
import { createFinaleRune } from './rune';
import type { FinaleFrame } from './timeline';

const C = PHASE0.QUEST.FINALE.CUTSCENE;
const { DARK, SETTLE_RATE } = FINALE_VISUAL;

export interface FinaleSceneDeps {
  parent: Object3D;
  places: readonly LandmarkPlace[];
  temple: { x: number; z: number };
  groundY: (x: number, z: number) => number;
  /** Where the camera is, for turning the rune to face it. */
  cameraPosition: () => Vector3;
}

export interface FinaleScene {
  /** Sets the levels from a frame of the timeline and draws them. */
  showFrame: (frame: FinaleFrame) => void;
  /** Eases the levels toward rest (faint once the name has returned, dark before) and draws what changed. */
  settle: (dt: number, nameReturned: boolean) => void;
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

/** `from` moved toward `to` by at most `step`. */
const toward = (from: number, to: number, step: number) =>
  from < to ? Math.min(to, from + step) : Math.max(to, from - step);

export function createFinaleScene(deps: FinaleSceneDeps): FinaleScene {
  const { places, temple, groundY } = deps;
  const group = new Group();
  group.name = 'finaleScene';
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
  /** The whole rune's glow. */
  let glow = 0;

  /**
   * Draws the levels. The beams and strokes are only touched when they changed; the rune turns to the camera
   * every frame it is shown. A beam or the rune that is dark is hidden.
   */
  const draw = (levelsChanged: boolean) => {
    if (levelsChanged) {
      for (const slot of slots) {
        const lit = slot.beamLevel > DARK;
        slot.beam.setVisible(lit);
        if (lit) slot.beam.update(slot.base, slot.beamLevel);
        rune.setStroke(slot.kind, slot.strokeLevel);
      }
      rune.setGlow(glow);
      rune.setVisible(glow > DARK);
    }
    if (glow > DARK) {
      const cam = deps.cameraPosition();
      rune.faceTowards(cam.x, cam.z);
    }
  };

  return {
    showFrame: (frame) => {
      for (const slot of slots) {
        slot.beamLevel = frame.beams[slot.kind] ?? 0;
        slot.strokeLevel = frame.strokes[slot.kind] ?? 0;
      }
      glow = frame.glow;
      draw(true);
    },
    settle: (dt, nameReturned) => {
      const step = SETTLE_RATE * dt;
      const beamRest = nameReturned ? C.BEAM_SETTLED : 0;
      const strokeRest = nameReturned ? 1 : 0;
      let changed = false;
      for (const slot of slots) {
        const beam = toward(slot.beamLevel, beamRest, step);
        const stroke = toward(slot.strokeLevel, strokeRest, step);
        changed ||= beam !== slot.beamLevel || stroke !== slot.strokeLevel;
        slot.beamLevel = beam;
        slot.strokeLevel = stroke;
      }
      const next = toward(glow, nameReturned ? C.RUNE_SETTLED : 0, step);
      changed ||= next !== glow;
      glow = next;
      draw(changed);
    },
    dispose: () => {
      for (const slot of slots) slot.beam.dispose();
      rune.dispose();
      deps.parent.remove(group);
    },
  };
}
