// src/rendering/postfx/controls/dofControls.ts — depth-of-field node + tunables
import { type PerspectiveCamera, Vector3 } from 'three';
import type DepthOfFieldNode from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { devSettings } from '../../../core/GameState';
import {
  applyDofTunables,
  createDofUniforms,
  type DofParams,
  defaultDofParams,
} from '../dofParams';

let _activeDofNode: DepthOfFieldNode | null = null;

const _camForward = new Vector3();
const _focusDelta = new Vector3();

/** Depth-of-field node + tunables. Active state also depends on the DEV "disable DoF" override. */
export function createDofControls(sharpColor: any, sceneViewZ: any) {
  let dofParams = defaultDofParams();
  const dofUniforms = createDofUniforms(dofParams);
  const { uFocusDistance, uFocalLength, uBokehScale } = dofUniforms;
  let smoothedFocusDistance = Number(uFocusDistance.value);

  const dofNode = dof(sharpColor, sceneViewZ, uFocusDistance, uFocalLength, uBokehScale);
  _activeDofNode = dofNode;

  applyDofTunables(dofParams, dofUniforms);

  return {
    dofColor: dofNode,
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
