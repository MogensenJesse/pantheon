// src/rendering/postfx/controls/godraysControls.ts — god-rays node graph + sun-driven tunables
import { type DirectionalLight, type PerspectiveCamera, Vector3 } from 'three';
import type BilateralBlurNode from 'three/addons/tsl/display/BilateralBlurNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { getCloudCastShadowLight } from '../../sunShadow';
import { currentSunAzimuthDeg, sunDirectionFromSpherical } from '../../sunSpherical';
import { EFFECT_BYPASS_OFF_EPS } from '../effectGraphBypass';
import {
  type GodraysNodeDirectional,
  godraysDirectional,
} from '../godrays/GodraysNodeDirectional.js';
import { createGodraysMaskFn, createGodraysMaskUniforms } from '../godraysMask';
import {
  applyGodraysTunables,
  createGodraysBlendUniforms,
  defaultGodraysParams,
  type GodraysParams,
  godraysBlendWeightForSun,
  godraysElevationWeightRamp,
} from '../godraysParams';

const { godrays: GODRAYS } = VISUAL;

let _activeGodraysNode: GodraysNodeDirectional | null = null;
let _activeGodraysBlur: BilateralBlurNode | null = null;

const _sunDir = new Vector3();

/** Keep GodraysNode in the graph (compiled) but skip raymarch/blur when mix weight is 0. */
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

/** Sun-driven light-shaft (god rays) node graph + tunables. Density/weight react to sun state each frame. */
export function createGodraysControls(
  sceneColor: any,
  sceneDepth: any,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
) {
  const godraysNode = godraysDirectional(sceneDepth, camera, sun);
  // Soft cloud-cast map — shafts occlude under clouds (separate from near PCSS).
  godraysNode.setCloudCastLight(getCloudCastShadowLight());
  // Main sun is hard coverage — sample directional depth compare (not PCSS color-depth).
  godraysNode.setPreferManualShadow(false);
  _activeGodraysNode = godraysNode;
  const godraysBlur = bilateralBlur(
    godraysNode.getTextureNode(),
    undefined,
    GODRAYS.BLUR_SIGMA,
    GODRAYS.BLUR_SIGMA_COLOR,
  );
  _activeGodraysBlur = godraysBlur;

  let godraysParams = defaultGodraysParams();
  const godraysMaskUniforms = createGodraysMaskUniforms({
    skyLumaStart: godraysParams.skyLumaStart,
    skyLumaEnd: godraysParams.skyLumaEnd,
    sunFacingMin: godraysParams.sunFacingMin,
    sunFacingMax: godraysParams.sunFacingMax,
    skyDepthStart: godraysParams.skyDepthStart,
    skyDepthEnd: godraysParams.skyDepthEnd,
  });
  const godraysMaskFn = createGodraysMaskFn(sceneColor, sceneDepth, camera, godraysMaskUniforms);
  const godraysBlend = createGodraysBlendUniforms(godraysParams);
  const godraysBlendOptions = {
    blendColor: godraysBlend.uBlendColor,
    edgeRadius: godraysBlend.uEdgeRadius,
    edgeStrength: godraysBlend.uEdgeStrength,
    maskFn: godraysMaskFn,
  };

  const uGodRaysWeight = uniform(0);
  let lastGodraysIntensity = 0;
  let lastSunIntensity = 0;
  let lastSunElevationDeg = 0;
  let lastSunHorizonElevationDeg = -90;
  let cohesionWeightMul = 1;
  /** After Phase 3.1 graph reconnect, keep blend at 0 until GodraysNode RTs are filled. */
  let reconnectSuppressFrames = 0;

  const applyNodeTunables = () => {
    applyGodraysTunables(godraysParams, godraysBlend, godraysMaskUniforms);
    godraysNode.raymarchSteps.value = Math.round(godraysParams.raymarchSteps);
    godraysNode.distanceAttenuation.value = godraysParams.distanceAttenuation;
  };

  /** Applies the current weight to the blend uniform, honoring DEV render-debug overrides. */
  const applyWeight = () => {
    if (
      import.meta.env.DEV &&
      (devSettings.renderDebug.disableGodRays || devSettings.renderDebug.disableShadows)
    ) {
      uGodRaysWeight.value = 0;
      return;
    }
    if (reconnectSuppressFrames > 0) {
      uGodRaysWeight.value = 0;
      return;
    }
    uGodRaysWeight.value = lastGodraysIntensity * cohesionWeightMul;
  };

  /** Pure sun-state update: recomputes density/weight from sun intensity + elevation above horizon. */
  const updateFromSun = (intensity: number, elevationDeg: number, horizonElevationDeg: number) => {
    lastSunIntensity = intensity;
    lastSunElevationDeg = elevationDeg;
    lastSunHorizonElevationDeg = horizonElevationDeg;
    const p = godraysParams;
    const elevAboveHorizonDeg = elevationDeg - horizonElevationDeg;
    const elevRamp = godraysElevationWeightRamp(elevAboveHorizonDeg, p);
    lastGodraysIntensity = godraysBlendWeightForSun(intensity, elevAboveHorizonDeg, p);

    sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
    godraysMaskUniforms.sunDirection.value.copy(_sunDir);

    const elevFactor = Math.max(
      p.elevFactorMin,
      Math.min(p.elevFactorMax, 1.05 - elevationDeg / p.elevRayFalloff),
    );
    // Soft intensity floor so golden-hour shafts stay visible (hard *intensity was ~0.05).
    const intensityFactor =
      Math.max(0.35, Math.min(1.2, intensity / p.sunIntensityRef + 0.25)) * elevRamp;
    godraysNode.density.value = p.densityBase * elevFactor * intensityFactor;
    godraysNode.maxDensity.value = p.maxDensityBase * elevFactor * elevRamp;
    godraysNode.distanceAttenuation.value = p.distanceAttenuation;
  };

  /** Effective mix weight for graph bypass (0 when DEV-disabled). */
  const getEffectiveWeight = (): number => {
    if (
      import.meta.env.DEV &&
      (devSettings.renderDebug.disableGodRays || devSettings.renderDebug.disableShadows)
    ) {
      return 0;
    }
    return lastGodraysIntensity * cohesionWeightMul;
  };

  applyNodeTunables();
  skipPassesWhenWeightZero(godraysNode, getEffectiveWeight);
  skipPassesWhenWeightZero(godraysBlur, getEffectiveWeight);

  return {
    godraysBlur,
    godraysBlendOptions,
    uGodRaysWeight,
    getEffectiveWeight,
    getGodraysParams: () => ({ ...godraysParams }),
    /** Bind live shadow depth before first Godrays setup (directional depth compare). */
    prepareShadowSampling: () => {
      godraysNode._syncShadowDepthSource();
    },
    getShadowSampleMode: () => 'directionalDepthCompare',
    getDirectionalDiagnose: () => {
      const target = sun.target.position;
      const camPos = camera.position;
      const halfX = Math.abs(sun.shadow.camera.right - sun.shadow.camera.left) * 0.5;
      const halfZ = Math.abs(sun.shadow.camera.top - sun.shadow.camera.bottom) * 0.5;
      const halfY = Math.max(halfX, halfZ, 220);
      const inVolume =
        Math.abs(camPos.x - target.x) <= halfX &&
        Math.abs(camPos.y - target.y) <= halfY &&
        Math.abs(camPos.z - target.z) <= halfZ;
      return {
        hasPcssColorDepth: false,
        cameraInMarchVolume: inVolume,
        followHalfXZ: halfX,
        raymarchSteps: Math.round(godraysParams.raymarchSteps),
        target: { x: target.x, y: target.y, z: target.z },
      };
    },
    getLiveDensity: () => ({
      density: Number(godraysNode.density.value),
      maxDensity: Number(godraysNode.maxDensity.value),
    }),
    updateParams: (params: Partial<GodraysParams>) => {
      godraysParams = { ...godraysParams, ...params };
      applyNodeTunables();
    },
    updateFromSun,
    getLastSunState: () => ({
      intensity: lastSunIntensity,
      elevationDeg: lastSunElevationDeg,
      horizonElevationDeg: lastSunHorizonElevationDeg,
    }),
    applyWeight,
    setCohesionWeightMul: (mul: number) => {
      cohesionWeightMul = mul;
    },
    /**
     * Zero the composite mix for N frames after the post graph reconnects god rays
     * (Phase 3.1 bypass). Lets GodraysNode + blur RTs populate before shafts appear.
     */
    beginReconnectWarmup: (frames = 2) => {
      reconnectSuppressFrames = Math.max(reconnectSuppressFrames, frames);
      uGodRaysWeight.value = 0;
    },
    /** Call once per presented frame while suppress is active. */
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
  _activeGodraysBlur?.dispose();
  _activeGodraysBlur = null;
  _activeGodraysNode?.dispose();
  _activeGodraysNode = null;
}
