// src/core/cinematic.ts — the camera director for scripted views (the last night's cutscene)
//
// A script says where the view looks and from where at each second; the director poses the camera there,
// eases in from wherever the camera was, takes the movement keys while it plays and hands the camera back to
// the follow rig, which glides it home. Like the overview it also moves the world's detail centre
// (grass, props, shadows) to what is looked at.

import { type PerspectiveCamera, Vector3 } from 'three';
import { orbitPose } from '../overview/overviewMath.ts';
import type { CameraRig } from '../rendering/CameraRig';
import { smoothstep01 } from './math/scalar.ts';

/** An orbit around a point: the ground position, the height looked at above it and how the camera sits. */
export interface CinematicView {
  x: number;
  z: number;
  lookM: number;
  distanceM: number;
  yaw: number;
  pitch: number;
}

export interface CinematicScript {
  duration: number;
  view: (t: number) => CinematicView;
  /** Every frame the script plays, with the time it is at (this is where the scene is dressed). */
  onFrame?: (t: number) => void;
}

export interface Cinematic {
  /** Plays a script (a script already playing is ignored); `onEnd` runs once when it ends or is skipped. */
  start: (script: CinematicScript, onEnd: () => void) => boolean;
  /** Jumps to the end of the script. */
  skip: () => void;
  /** A script is playing: the movement keys belong to it. */
  isPlaying: () => boolean;
  /** 0 off, 1 fully in the script's view; eases in and out (a skip keeps it at 1 until the script ends). */
  weight: () => number;
  /** The camera pitch to judge the view by (water quality): the roam pitch blended into the script's. */
  viewPitch: (roamPitch: number) => number;
  /** Once per frame. Poses the camera and returns true while a script plays; false when the follow camera runs. */
  update: (dt: number) => boolean;
  /** Where the world's detail should centre: the player, blended into what the script looks at. */
  focusPoint: (out: Vector3, playerRender: Vector3) => Vector3;
  /** Called every frame, playing or not (for things that settle after a script). */
  onFrame: (listener: (dt: number) => void) => () => void;
}

export interface CinematicDeps {
  camera: PerspectiveCamera;
  cameraRig: CameraRig;
  groundY: (x: number, z: number) => number;
}

/** Seconds the view takes to leave where the camera was and settle into the script's. */
const ENTER_S = 1.6;
/** Seconds the detail centre takes to return to the player after a script. */
const LEAVE_S = 3;
/** The camera keeps at least this far above the ground (m). */
const GROUND_CLEARANCE_M = 3;

export function createCinematic(deps: CinematicDeps): Cinematic {
  const { camera, cameraRig, groundY } = deps;
  const listeners = new Set<(dt: number) => void>();

  let script: CinematicScript | null = null;
  let onEnd: (() => void) | null = null;
  let t = 0;
  /** Seconds since the script began: the weight (never reset). */
  let entered = 0;
  /** Seconds the pose has been easing from `fromPos`/`fromLook` (restarted by a skip). */
  let blend = 0;
  let leaving = 0;
  let skipped = false;
  let pitch = 0;

  const fromPos = new Vector3();
  const fromLook = new Vector3();
  const pos = new Vector3();
  const look = new Vector3();
  const focus = new Vector3();

  const pose = (view: CinematicView) => {
    const at = { x: view.x, y: groundY(view.x, view.z) + view.lookM, z: view.z };
    const orbit = orbitPose(at, view.yaw, view.pitch, view.distanceM);
    look.set(orbit.look.x, orbit.look.y, orbit.look.z);
    const { x, y, z } = orbit.position;
    pos.set(x, Math.max(y, groundY(x, z) + GROUND_CLEARANCE_M), z);
  };

  const finish = () => {
    if (!script) return;
    script.onFrame?.(script.duration);
    // The follow camera carries on from here and glides back.
    cameraRig.setPose(camera.position, focus);
    const done = onEnd;
    script = null;
    onEnd = null;
    leaving = 1;
    done?.();
  };

  const weight = () => {
    if (script) return smoothstep01(entered / ENTER_S);
    return smoothstep01(leaving);
  };

  return {
    start: (next, end) => {
      if (script) return false;
      script = next;
      onEnd = end;
      t = 0;
      entered = 0;
      blend = 0;
      leaving = 0;
      skipped = false;
      camera.getWorldPosition(fromPos);
      cameraRig.getLook(fromLook);
      focus.copy(fromLook);
      return true;
    },
    skip: () => {
      if (!script || skipped) return;
      // Glide from where the view is to the end of the script, then hand the camera back.
      skipped = true;
      t = script.duration;
      blend = 0;
      camera.getWorldPosition(fromPos);
      fromLook.copy(focus);
    },
    isPlaying: () => script !== null,
    weight,
    viewPitch: (roamPitch) => roamPitch + (pitch - roamPitch) * weight(),
    update: (dt) => {
      for (const listener of listeners) listener(dt);
      if (!script) {
        if (leaving > 0) leaving = Math.max(0, leaving - dt / LEAVE_S);
        return false;
      }
      t = Math.min(script.duration, t + dt);
      entered += dt;
      blend += dt;
      script.onFrame?.(t);
      const view = script.view(t);
      pitch = view.pitch;
      pose(view);
      const k = smoothstep01(blend / ENTER_S);
      camera.position.copy(fromPos).lerp(pos, k);
      // Look from the old look point toward the script's.
      focus.copy(fromLook).lerp(look, k);
      cameraRig.setPose(camera.position, focus);
      if (t >= script.duration && (!skipped || blend >= ENTER_S)) finish();
      return true;
    },
    focusPoint: (out, playerRender) => {
      const w = weight();
      if (w <= 0) return out.copy(playerRender);
      return out.copy(playerRender).lerp(look, w);
    },
    onFrame: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
