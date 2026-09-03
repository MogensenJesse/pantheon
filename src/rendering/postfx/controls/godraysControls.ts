// src/rendering/postfx/controls/godraysControls.ts — occlusion-shaft node graph + sun-driven weight
import type { Color, PerspectiveCamera } from 'three';
import { uniform } from 'three/tsl';
import { GODRAYS_MAX_SAMPLES } from '../../../config/visual/godrays';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { EFFECT_BYPASS_OFF_EPS } from '../effectGraphBypass';
import { type GodraysRadialNode, godraysRadial } from '../godrays/GodraysRadialNode';
import {
  createGodraysTintUniform,
  defaultGodraysParams,
  type GodraysParams,
  godraysBlendWeightForSun,
} from '../godraysParams';

const { godrays: GODRAYS } = VISUAL;

let _activeGodraysNode: GodraysRadialNode | null = null;

/** Keep the shaft node compiled but skip the half-res pass when additive weight is 0. */
function skipPassesWhenWeightZero(
  node: { updateBefore: (frame: never) => unknown },
  getWeight: () => number,
): void {
  const runPasses = node.updateBefore.bind(node);
  let filled = false;
  node.updateBefore = ((frame: never) => {
    if (filled && getWeight() < EFFECT_BYPASS_OFF_EPS) return;
    const result = runPasses(frame);
    filled = true;
    return result;
  }) as typeof node.updateBefore;
}

/** Sun-driven occlusion shafts + tunables. Weight reacts to sun state each frame. */
export function createGodraysControls(sceneDepth: any, camera: PerspectiveCamera) {
  const godraysNode = godraysRadial(sceneDepth, camera);
  godraysNode.setOffscreenFadeRange(GODRAYS.OFFSCREEN_FADE);
  _activeGodraysNode = godraysNode;

  let godraysParams = defaultGodraysParams();
  const uTint = createGodraysTintUniform(godraysParams);
  const uGodRaysWeight = uniform(0);
  let lastGodraysIntensity = 0;
  let lastSunIntensity = 0;
  let lastSunElevationDeg = 0;
  let reconnectSuppressFrames = 0;

  const applyNodeTunables = () => {
    const p = godraysParams;
    godraysNode.samples.value = Math.min(GODRAYS_MAX_SAMPLES, Math.round(p.samples));
    godraysNode.density.value = p.density;
    godraysNode.decay.value = p.decay;
    godraysNode.exposure.value = p.exposure;
    godraysNode.depthStart.value = p.depthStart;
    godraysNode.depthEnd.value = p.depthEnd;
    godraysNode.sunCore.value = p.sunCore;
    godraysNode.sunRadius.value = Math.max(p.sunRadius, p.sunCore + 0.001);
    godraysNode.setOffscreenFadeRange(p.offscreenFade);
    (uTint.value as Color).set(p.tintR, p.tintG, p.tintB);
  };

  const applyWeight = () => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableGodRays) {
      uGodRaysWeight.value = 0;
      return;
    }
    if (reconnectSuppressFrames > 0) {
      uGodRaysWeight.value = 0;
      return;
    }
    uGodRaysWeight.value = lastGodraysIntensity;
  };

  const updateFromSun = (intensity: number, elevationDeg: number) => {
    lastSunIntensity = intensity;
    lastSunElevationDeg = elevationDeg;
    lastGodraysIntensity = godraysBlendWeightForSun(intensity, elevationDeg, godraysParams);
  };

  const getEffectiveWeight = (): number => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableGodRays) {
      return 0;
    }
    return lastGodraysIntensity;
  };

  applyNodeTunables();
  skipPassesWhenWeightZero(godraysNode, getEffectiveWeight);

  return {
    godraysNode,
    uTint,
    uGodRaysWeight,
    getEffectiveWeight,
    getGodraysParams: () => ({ ...godraysParams }),
    getSunScreen: () => ({
      u: godraysNode.lastSunUv.x,
      v: godraysNode.lastSunUv.y,
      inFront: godraysNode.lastInFront,
      offscreenFade: godraysNode.lastOffscreenFade,
    }),
    updateParams: (params: Partial<GodraysParams>) => {
      godraysParams = { ...godraysParams, ...params };
      applyNodeTunables();
    },
    updateFromSun,
    getLastSunState: () => ({
      intensity: lastSunIntensity,
      elevationDeg: lastSunElevationDeg,
    }),
    applyWeight,
    beginReconnectWarmup: (frames = 2) => {
      reconnectSuppressFrames = Math.max(reconnectSuppressFrames, frames);
      uGodRaysWeight.value = 0;
    },
    tickReconnectWarmup: () => {
      if (reconnectSuppressFrames > 0) {
        reconnectSuppressFrames -= 1;
        if (reconnectSuppressFrames === 0) {
          applyWeight();
        }
      }
    },
  };
}

export function disposeActiveGodrays(): void {
  _activeGodraysNode?.dispose();
  _activeGodraysNode = null;
}
