// src/overview/overviewController.ts — the village overview: press B near the temple and the
// camera lifts above the village, the mouse is free, and the orb becomes the cursor.
//
//   roam → entering → overview → leaving → roam
//
// While active the player does not move (the orb is drawn at the mouse's ground point through
// `player.setVisualOverride`; its logic position, pickups and the sim are untouched), the camera is
// ours instead of the follow rig's, and the pause menu stays shut. `update` runs once per frame before
// the player is drawn and says whether it posed the camera.

import { type PerspectiveCamera, Vector3 } from 'three';
import { PHASE0 } from '../config/phase0';
import type { CameraInputContext } from '../core/CameraInput';
import { getMovementDirection } from '../core/InputManager';
import { lerp } from '../core/math/scalar';
import type { PlayerControllerContext } from '../entities/PlayerController';
import type { CameraRig } from '../rendering/CameraRig';
import { createHint, isModalPanelOpen, isPanelOpen, keycap, registerHotkey } from '../ui/kit';
import {
  canEnterOverview,
  clampDistance,
  clampFocus,
  type Disc,
  grabShift,
  orbitPose,
  panStep,
  pitchRad,
  rayGroundHit,
  rayPlaneHit,
  smoothstep,
} from './overviewMath';

const O = PHASE0.OVERVIEW;
const ORB_RADIUS = PHASE0.ORB.PLAYER_RADIUS;
/** Longest ray searched for the ground under the mouse (m) and its step. */
const RAY_MAX_M = O.RAY_MAX_M;
const RAY_STEP_M = O.RAY_STEP_M;
const HINT_CHECK_MS = 250;
const GOAL_SMOOTH = O.GOAL_SMOOTH;

export type OverviewPhase = 'roam' | 'entering' | 'overview' | 'leaving';

export interface OverviewDeps {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  cameraRig: CameraRig;
  cameraInput: CameraInputContext;
  player: PlayerControllerContext;
  groundY: (x: number, z: number) => number;
  /** The village's disc: the camera stays within it (plus a margin). */
  village: Disc;
  /** The temple's centre and half footprint as a circle; null where there is none. */
  temple: { x: number; z: number; radiusM: number } | null;
  /** The village has been converted. */
  isConverted: () => boolean;
}

export interface OverviewDebug {
  phase: OverviewPhase;
  progress: number;
  yaw: number;
  distance: number;
  focus: { x: number; y: number; z: number };
  /** Where the orb cursor is drawn, or null when the orb is on the player. */
  cursor: { x: number; y: number; z: number } | null;
  /** The ground point under the mouse, or null. */
  hover: { x: number; y: number; z: number } | null;
}

/** True when the listener took the click. */
export type ClickListener = (x: number, y: number) => boolean | undefined;

export interface Overview {
  phase: () => OverviewPhase;
  /** Roam, or on its way back: false only while the player is fully in control. */
  isActive: () => boolean;
  /** The overview owns the movement keys: the orb stays where it is. */
  capturesMovement: () => boolean;
  /** The ground point under the mouse (overview only), or null. */
  hoverPoint: () => Vector3 | null;
  /** The mouse over the game, in client px (`inside` false when it is over a panel or away). */
  /** The mouse over the canvas now (one shared record, read it, do not keep it). */
  mouse: () => Readonly<{ x: number; y: number; inside: boolean }>;
  /** The ray from the camera through the mouse, written into the outputs; false when there is none. */
  mouseRay: (origin: Vector3, direction: Vector3) => boolean;
  /** Camera distance from what it looks at (m). */
  distance: () => number;
  /** Move the view to look at (x, z), easing there; any pan or grab takes over. */
  focusOn: (x: number, z: number) => void;
  /**
   * Esc goes to this first: when it says it took the key (disarming a power, say), the overview stays.
   * One guard; setting another replaces it.
   */
  setEscapeGuard: (guard: (() => boolean) | null) => void;
  /**
   * Called with the client position of a left click (a press and release that did not drag). A listener that
   * returns true took the click (a power cast, say) and the ones after it do not hear of it; `first` puts a
   * listener ahead of the rest, whatever the order they were added in.
   */
  onClick: (listener: ClickListener, options?: { first?: boolean }) => () => void;
  /** Called at the end of every frame the overview is in use, after the camera is posed. */
  onFrame: (listener: () => void) => () => void;
  toggle: () => void;
  /** Start (or leave) without the temple rule; for the DEV probe. */
  setActive: (active: boolean, force?: boolean) => void;
  /**
   * Once per frame, before the player is drawn. Poses the camera while active and returns true; returns
   * false when the follow camera should run.
   */
  update: (dt: number, anchor: Vector3, roamYaw: number, roamPitch: number) => boolean;
  /** Where the world's detail should centre (grass, props, shadows, focus): the player, blended into the view. */
  focusPoint: (out: Vector3, playerRender: Vector3) => Vector3;
  /** 0 while roaming, 1 in the overview, in between during the moves (eased). */
  weight: () => number;
  /** The camera pitch to judge the view by (water quality). */
  viewPitch: (roamPitch: number) => number;
  /** Where the orb is drawn while it is the cursor, or null. */
  cursorPosition: () => Vector3 | null;
  debug: () => OverviewDebug;
  dispose: () => void;
}

export function createOverview(deps: OverviewDeps): Overview {
  const { canvas, camera, cameraRig, cameraInput, player, groundY, village, temple } = deps;

  let wanted = false;
  let progress = 0;
  let yaw = 0;
  let distance: number = O.DISTANCE_START_M;
  let wantDistance: number = distance;
  const focus = new Vector3();
  const pitch = pitchRad();

  // The camera's catch-up lag when entering (the follow camera trails the orb): carried into the move
  // and faded out, so the first frame does not jump.
  const offsetPos = new Vector3();
  const offsetLook = new Vector3();
  let offsetWeight = 1;
  let needOffset = true;

  // The mouse.
  const mouse = { x: 0, y: 0, inside: false };
  let dragButton = -1;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragMoved = false;
  let lastDragX = 0;
  let pendingYaw = 0;
  const grab = new Vector3();
  let grabbing = false;
  /** Where `focusOn` is taking the view, or null. */
  let goal: { x: number; z: number } | null = null;
  const clickListeners: ClickListener[] = [];
  const frameListeners = new Set<() => void>();

  // The orb cursor.
  const cursor = new Vector3();
  let cursorScale = 1;
  const cursorTarget = new Vector3();
  let cursorTargetScale = 1;
  let cursorLive = false;
  const hover = new Vector3();
  let hasHover = false;
  let elapsed = 0;

  const roamCam = new Vector3();
  const roamLook = new Vector3();
  const ray = new Vector3();
  const rayDir = new Vector3();
  const pose = { pos: new Vector3(), look: new Vector3() };
  const tmpA = new Vector3();
  const tmpB = new Vector3();

  const phase = (): OverviewPhase => {
    if (wanted) return progress >= 1 ? 'overview' : 'entering';
    return progress > 0 ? 'leaving' : 'roam';
  };

  const mouseRay = (): boolean => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    ray.set(
      ((mouse.x - rect.left) / rect.width) * 2 - 1,
      -(((mouse.y - rect.top) / rect.height) * 2 - 1),
      0.5,
    );
    ray.unproject(camera);
    rayDir.copy(ray).sub(camera.position).normalize();
    return true;
  };

  // --- input -------------------------------------------------------------------------------------

  const onPointerDown = (e: PointerEvent) => {
    if (!wanted) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.inside = true;
    if (dragButton !== -1) return;
    if (e.button !== 0 && e.button !== 2) return;
    dragButton = e.button;
    dragStartX = lastDragX = e.clientX;
    dragStartY = e.clientY;
    dragMoved = false;
    canvas.setPointerCapture(e.pointerId);
    goal = null;
    if (e.button === 0 && mouseRay()) {
      const hit = rayGroundHit(camera.position, rayDir, groundY, RAY_MAX_M, RAY_STEP_M);
      grabbing = hit !== null;
      if (hit) grab.copy(hit);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.inside = true;
    if (dragButton === -1) return;
    if (
      !dragMoved &&
      Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > O.CLICK_SLOP_PX
    ) {
      dragMoved = true;
    }
    if (dragButton === 2) {
      pendingYaw -= (e.clientX - lastDragX) * O.ROTATE_PER_PX;
    }
    lastDragX = e.clientX;
  };
  const endDrag = (e: PointerEvent) => {
    if (dragButton === -1) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const click = e.type === 'pointerup' && dragButton === 0 && !dragMoved;
    dragButton = -1;
    grabbing = false;
    if (click) {
      for (const listener of [...clickListeners]) if (listener(e.clientX, e.clientY)) break;
    }
  };
  const onPointerLeave = () => {
    if (dragButton === -1) mouse.inside = false;
  };
  const onWheel = (e: WheelEvent) => {
    if (!wanted) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    wantDistance = clampDistance(wantDistance * Math.exp(dy * O.ZOOM_PER_DELTA));
  };
  const onContextMenu = (e: Event) => e.preventDefault();

  const listen = (on: boolean) => {
    const toggle = on
      ? canvas.addEventListener.bind(canvas)
      : canvas.removeEventListener.bind(canvas);
    toggle('pointerdown', onPointerDown as EventListener);
    toggle('pointermove', onPointerMove as EventListener);
    toggle('pointerup', endDrag as EventListener);
    toggle('pointercancel', endDrag as EventListener);
    toggle('pointerleave', onPointerLeave);
    toggle('wheel', onWheel as EventListener, { passive: false });
    toggle('contextmenu', onContextMenu);
  };

  // Esc leaves the overview instead of opening the pause menu. It is taken before the hotkey table sees
  // it, and only when no panel is open (then Esc belongs to the panel).
  let escapeGuard: (() => boolean) | null = null;
  const onEscape = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' || !wanted || isPanelOpen()) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (escapeGuard?.()) return;
    setActive(false);
  };
  document.addEventListener('keydown', onEscape, true);

  // --- entering and leaving ----------------------------------------------------------------------

  const nearTemple = (): boolean => {
    if (!temple) return false;
    return canEnterOverview({
      converted: deps.isConverted(),
      templeDistanceM: Math.hypot(player.position.x - temple.x, player.position.z - temple.z),
      templeRadiusM: temple.radiusM,
    });
  };

  const canStart = (): boolean => !isModalPanelOpen() && (progress > 0 || nearTemple());

  function setActive(active: boolean, force = false): void {
    if (active === wanted) return;
    if (active) {
      if (!force && !canStart()) return;
      wanted = true;
      if (progress === 0) {
        needOffset = true;
        yaw = cameraInput.getYaw();
        distance = wantDistance = O.DISTANCE_START_M;
        const c = clampFocus(player.position.x, player.position.z, village);
        focus.set(c.x, groundY(c.x, c.z), c.z);
        cursor.copy(player.position);
        cursorScale = 1;
        cursorLive = true;
        hasHover = false;
      }
      pendingYaw = 0;
      cameraInput.setCaptureEnabled(false);
      cameraInput.setLookBlocked(true);
      if (document.pointerLockElement) document.exitPointerLock();
      canvas.style.cursor = 'none';
      listen(true);
    } else {
      wanted = false;
      dragButton = -1;
      grabbing = false;
      listen(false);
      cameraInput.setCaptureEnabled(true);
      cameraInput.setLookBlocked(false);
      canvas.style.cursor = '';
    }
  }

  const toggle = () => setActive(!wanted);
  // Works with the overview's own info panel open (it is not modal); a modal panel owns the keys.
  const offKey = registerHotkey(
    'KeyB',
    () => {
      if (!isModalPanelOpen()) toggle();
    },
    'Village overview',
  );

  // --- the frame ---------------------------------------------------------------------------------

  const applyPose = (w: number, anchor: Vector3, roamYaw: number, roamPitch: number): void => {
    cameraRig.computePose(anchor, roamYaw, roamPitch, roamCam, roamLook);
    const ov = orbitPose(focus, yaw, pitch, distance);
    pose.pos
      .copy(roamCam)
      .addScaledVector(offsetPos, offsetWeight * (1 - w))
      .lerp(tmpA.set(ov.position.x, ov.position.y, ov.position.z), w);
    pose.look
      .copy(roamLook)
      .addScaledVector(offsetLook, offsetWeight * (1 - w))
      .lerp(tmpB.set(ov.look.x, ov.look.y, ov.look.z), w);
    cameraRig.setPose(pose.pos, pose.look);
    camera.updateMatrixWorld(true);
  };

  function update(dt: number, anchor: Vector3, roamYaw: number, roamPitch: number): boolean {
    if (!wanted && progress === 0) return false;
    elapsed += dt;

    if (needOffset) {
      // The follow camera's actual pose against where it wants to be.
      cameraRig.computePose(anchor, roamYaw, roamPitch, roamCam, roamLook);
      offsetPos.copy(camera.position).sub(roamCam);
      cameraRig.getLook(offsetLook).sub(roamLook);
      offsetWeight = 1;
      needOffset = false;
    }

    progress = Math.max(0, Math.min(1, progress + ((wanted ? 1 : -1) * dt) / O.TRANSITION_S));
    const w = smoothstep(progress);
    offsetWeight = wanted
      ? Math.min(offsetWeight, 1 - w)
      : offsetWeight * Math.exp(-O.OFFSET_FADE_PER_S * dt);

    if (wanted) {
      yaw += pendingYaw;
      pendingYaw = 0;
      distance += (wantDistance - distance) * (1 - Math.exp(-O.ZOOM_SMOOTH * dt));
      const dir = getMovementDirection();
      if (dir.x !== 0 || dir.y !== 0) {
        goal = null;
        const step = panStep(dir, yaw, distance, dt);
        focus.x += step.x;
        focus.z += step.z;
      } else if (goal) {
        const k = 1 - Math.exp(-GOAL_SMOOTH * dt);
        focus.x += (goal.x - focus.x) * k;
        focus.z += (goal.z - focus.z) * k;
        if (Math.hypot(goal.x - focus.x, goal.z - focus.z) < 0.3) goal = null;
      }
    }

    // First pass at the pose, then the ground grab against it: the point that was pressed has to be
    // under the mouse; the focus moves by the difference and the pose is made again.
    applyPose(w, anchor, roamYaw, roamPitch);
    if (wanted && grabbing && mouseRay()) {
      const now = rayPlaneHit(camera.position, rayDir, grab.y);
      if (now) {
        const shift = grabShift(grab, now);
        focus.x += shift.x;
        focus.z += shift.z;
      }
    }
    if (wanted) {
      const c = clampFocus(focus.x, focus.z, village);
      focus.x = c.x;
      focus.z = c.z;
    }
    focus.y += (groundY(focus.x, focus.z) - focus.y) * (1 - Math.exp(-O.ZOOM_SMOOTH * dt));
    applyPose(w, anchor, roamYaw, roamPitch);

    // The orb cursor.
    hasHover = false;
    if (wanted && mouse.inside && mouseRay()) {
      const hit = rayGroundHit(camera.position, rayDir, groundY, RAY_MAX_M, RAY_STEP_M);
      if (hit) {
        hover.set(hit.x, hit.y, hit.z);
        hasHover = true;
      }
    }
    if (wanted) {
      if (hasHover) {
        cursorTargetScale = Math.max(1, distance * O.CURSOR_SCALE_PER_M);
        cursorTarget.set(
          hover.x,
          hover.y +
            cursorTargetScale * (ORB_RADIUS + O.CURSOR_HOVER_M) +
            PHASE0.ORB.BOB_AMPLITUDE * cursorTargetScale * Math.sin(elapsed * PHASE0.ORB.BOB_SPEED),
          hover.z,
        );
      }
    } else {
      cursorTarget.copy(player.position);
      cursorTargetScale = 1;
    }
    if (!wanted && progress === 0) {
      cursorLive = false;
      player.setVisualOverride(null);
      return false;
    }
    if (wanted && !hasHover && !mouse.inside) cursorTarget.copy(cursor);
    const k = 1 - Math.exp(-O.CURSOR_SMOOTH * dt);
    cursor.lerp(cursorTarget, k);
    cursorScale += (cursorTargetScale - cursorScale) * k;
    player.setVisualOverride(cursor, cursorScale);
    for (const listener of frameListeners) listener();
    return true;
  }

  const focusPoint = (out: Vector3, playerRender: Vector3): Vector3 => {
    if (!wanted && progress === 0) return out.copy(playerRender);
    return out.copy(playerRender).lerp(focus, smoothstep(progress));
  };

  // --- hints -------------------------------------------------------------------------------------

  const hintStart = createHint(['Press ', keycap('B'), ' to survey the village']);
  const hintKeys = createHint([
    keycap('B'),
    ' or ',
    keycap('Esc'),
    ' to return · WASD move · wheel zoom · drag to grab · right-drag to turn',
  ]);
  const hintTimer = window.setInterval(() => {
    hintStart.show(!wanted && progress === 0 && !isPanelOpen() && nearTemple());
    hintKeys.show(wanted);
  }, HINT_CHECK_MS);

  return {
    phase,
    isActive: () => wanted || progress > 0,
    capturesMovement: () => wanted,
    hoverPoint: () => (hasHover ? hover : null),
    mouse: () => mouse,
    mouseRay: (origin, direction) => {
      if (!wanted || !mouseRay()) return false;
      origin.copy(camera.position);
      direction.copy(rayDir);
      return true;
    },
    distance: () => distance,
    focusOn: (x, z) => {
      const c = clampFocus(x, z, village);
      goal = { x: c.x, z: c.z };
    },
    setEscapeGuard: (guard) => {
      escapeGuard = guard;
    },
    onClick: (listener, options) => {
      if (options?.first) clickListeners.unshift(listener);
      else clickListeners.push(listener);
      return () => {
        const at = clickListeners.indexOf(listener);
        if (at >= 0) clickListeners.splice(at, 1);
      };
    },
    onFrame: (listener) => {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    toggle,
    setActive,
    update,
    focusPoint,
    weight: () => smoothstep(progress),
    viewPitch: (roamPitch) => lerp(roamPitch, pitch, smoothstep(progress)),
    cursorPosition: () => (wanted || progress > 0 ? cursor : null),
    debug: () => ({
      phase: phase(),
      progress,
      yaw,
      distance,
      focus: { x: focus.x, y: focus.y, z: focus.z },
      cursor: cursorLive ? { x: cursor.x, y: cursor.y, z: cursor.z } : null,
      hover: hasHover ? { x: hover.x, y: hover.y, z: hover.z } : null,
    }),
    dispose: () => {
      window.clearInterval(hintTimer);
      document.removeEventListener('keydown', onEscape, true);
      offKey();
      listen(false);
      hintStart.dispose();
      hintKeys.dispose();
      canvas.style.cursor = '';
      player.setVisualOverride(null);
      cameraInput.setCaptureEnabled(true);
      cameraInput.setLookBlocked(false);
    },
  };
}
