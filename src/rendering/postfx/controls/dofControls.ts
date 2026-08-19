// src/rendering/postfx/controls/dofControls.ts — depth-of-field node + tunables
import { type PerspectiveCamera, Vector3 } from 'three';
import type DepthOfFieldNode from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { Fn, max, min, rtt, vec3, vec4 } from 'three/tsl';
import { RendererUtils } from 'three/webgpu';
import { devSettings } from '../../../core/GameState';
import {
  applyDofTunables,
  createDofUniforms,
  type DofParams,
  defaultDofParams,
} from '../dofParams';

/**
 * Display-referred DoF input cap — below half-float max so 16-tap bokeh `max()`
 * cannot overflow the composite to Inf/NaN (horizon sun → CSS-background flash).
 */
const DOF_INPUT_RGB_MAX = 16;

let _activeDofNode: DepthOfFieldNode | null = null;

const _camForward = new Vector3();
const _focusDelta = new Vector3();

type SharpRtt = ReturnType<typeof rtt> & {
  node: unknown;
  _rttNode?: unknown;
  textureNeedsUpdate?: boolean;
  _quadMesh?: { material: { needsUpdate: boolean } };
};

const clampDofInput = (sharpColor: unknown) =>
  Fn(() => {
    const sample = sharpColor as { rgb: ReturnType<typeof vec3> };
    const rgb = min(max(sample.rgb, vec3(0)), vec3(DOF_INPUT_RGB_MAX));
    return vec4(rgb, 1);
  })();

/**
 * Rebind the sharp input without disposing DepthOfFieldNode. Skip a couple of
 * composite passes so the last bokeh RT stays on screen while a rebuild compiles
 * (DEV toggles, bloom bypass — not the dawn path).
 */
function wrapDofUpdateBefore(
  dofNode: DepthOfFieldNode,
  getSkipPasses: () => number,
  consumeSkip: () => void,
  onFilled: () => void,
): void {
  const runPasses = dofNode.updateBefore.bind(dofNode);
  dofNode.updateBefore = ((frame: { renderer?: object | null }) => {
    const renderer = frame.renderer;
    if (!renderer) return;
    if (getSkipPasses() > 0) {
      consumeSkip();
      return;
    }
    const state = RendererUtils.saveRendererState(renderer as never);
    try {
      const result = runPasses(frame as never);
      onFilled();
      return result;
    } finally {
      RendererUtils.restoreRendererState(renderer as never, state);
    }
  }) as typeof dofNode.updateBefore;
}

/** Depth-of-field node + tunables. Active state also depends on the DEV "disable DoF" override. */
export function createDofControls(sharpColor: any, sceneViewZ: any) {
  let dofParams = defaultDofParams();
  const dofUniforms = createDofUniforms(dofParams);
  const { uFocusDistance, uFocalLength, uBokehScale } = dofUniforms;
  let smoothedFocusDistance = Number(uFocusDistance.value);
  let skipPasses = 0;
  let hasFilledComposite = false;

  const sharpRtt = rtt(clampDofInput(sharpColor)) as SharpRtt;
  const dofNode = dof(sharpRtt, sceneViewZ, uFocusDistance, uFocalLength, uBokehScale);
  wrapDofUpdateBefore(
    dofNode,
    () => skipPasses,
    () => {
      skipPasses = Math.max(0, skipPasses - 1);
    },
    () => {
      hasFilledComposite = true;
    },
  );
  _activeDofNode = dofNode;

  applyDofTunables(dofParams, dofUniforms);

  return {
    dofColor: dofNode,
    /** Swap grade/SMAA input without disposing the DoF composite (graph rebuild). */
    rebindSharp: (nextSharp: unknown) => {
      const next = clampDofInput(nextSharp);
      sharpRtt.node = next;
      sharpRtt._rttNode = next;
      sharpRtt.textureNeedsUpdate = true;
      if (sharpRtt._quadMesh) sharpRtt._quadMesh.material.needsUpdate = true;
      skipPasses = hasFilledComposite ? 2 : 0;
    },
    /** Live focus uniforms — used to CoC-gate post-DoF FXAA. */
    uFocusDistance,
    uFocalLength,
    isActive: () =>
      dofParams.enabled && !(import.meta.env.DEV && devSettings.renderDebug.disableDof),
    getDofParams: () => ({ ...dofParams }),
    updateParams: (params: Partial<DofParams>) => {
      dofParams = { ...dofParams, ...params };
      applyDofTunables(dofParams, dofUniforms);
    },
    resetParams: () => {
      dofParams = defaultDofParams();
      applyDofTunables(dofParams, dofUniforms);
    },
    setDofFocus: (cam: PerspectiveCamera, focusWorld: Vector3, delta: number) => {
      cam.getWorldDirection(_camForward);
      _focusDelta.subVectors(focusWorld, cam.position);
      const target = Math.max(0.1, _focusDelta.dot(_camForward) + dofParams.focusDistanceOffset);
      const t = 1 - Math.exp(-dofParams.focusSmooth * Math.max(delta, 0));
      smoothedFocusDistance += (target - smoothedFocusDistance) * t;
      uFocusDistance.value = smoothedFocusDistance;
    },
    setDofBokehScale: (scale: number) => {
      uBokehScale.value = Math.max(0, scale);
    },
  };
}

export function disposeActiveDof(): void {
  _activeDofNode?.dispose();
  _activeDofNode = null;
}
