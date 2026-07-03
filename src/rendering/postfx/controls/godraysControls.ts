// src/rendering/postfx/controls/godraysControls.ts — god-rays node graph + sun-driven tunables
import { type DirectionalLight, type PerspectiveCamera, Vector3 } from 'three';
import type BilateralBlurNode from 'three/addons/tsl/display/BilateralBlurNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import type GodraysNode from 'three/addons/tsl/display/GodraysNode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { currentSunAzimuthDeg, sunDirectionFromSpherical } from '../../sunSpherical';
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

let _activeGodraysNode: GodraysNode | null = null;
let _activeGodraysBlur: BilateralBlurNode | null = null;

const _sunDir = new Vector3();

/** Sun-driven light-shaft (god rays) node graph + tunables. Density/weight react to sun state each frame. */
export function createGodraysControls(
  sceneColor: any,
  sceneDepth: any,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
) {
  const godraysNode = godrays(sceneDepth, camera, sun);
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

  const applyTunablesLocal = () => {
    applyGodraysTunables(godraysParams, godraysBlend, godraysMaskUniforms);
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
    const intensityFactor = Math.max(0.05, intensity / p.sunIntensityRef) * elevRamp;
    godraysNode.density.value = p.densityBase * elevFactor * intensityFactor;
    godraysNode.maxDensity.value = p.maxDensityBase * elevFactor * elevRamp;
  };

  applyTunablesLocal();

  return {
    godraysBlur,
    godraysBlendOptions,
    uGodRaysWeight,
    getGodraysParams: () => ({ ...godraysParams }),
    updateParams: (params: Partial<GodraysParams>) => {
      godraysParams = { ...godraysParams, ...params };
      applyTunablesLocal();
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
  };
}

export function disposeActiveGodrays(): void {
  _activeGodraysBlur?.dispose();
  _activeGodraysBlur = null;
  _activeGodraysNode?.dispose();
  _activeGodraysNode = null;
}
