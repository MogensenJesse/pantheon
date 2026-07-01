// src/rendering/atmosphere/valleyFog.ts — scene.fogNode valley band + distance haze (webgpu_custom_fog pattern)
import type { Scene } from 'three';
import { Color } from 'three';
import { color, densityFogFactor, float, fog, positionWorld, triNoise3D, uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { fogTopForElevation, hazeStrengthForElevation } from './hazeCycleStrength';
import { type HazeTintParams, sampleHazeTint } from './sampleHazeTint';

export interface ValleyFogParams {
  fogBase: number;
  fogTop: number;
  hazeDensity: number;
  bandStrength: number;
  noiseScaleA: number;
  noiseScaleB: number;
  noiseAmplitude: number;
  noiseStrength: number;
  nightColor: string;
  dayColor: string;
}

export interface ValleyFogUniforms {
  uFogBase: ReturnType<typeof uniform>;
  uFogTop: ReturnType<typeof uniform>;
  uHazeDensity: ReturnType<typeof uniform>;
  uBandStrength: ReturnType<typeof uniform>;
  uNoiseScaleA: ReturnType<typeof uniform>;
  uNoiseScaleB: ReturnType<typeof uniform>;
  uNoiseAmplitude: ReturnType<typeof uniform>;
  uNoiseStrength: ReturnType<typeof uniform>;
  uFogMaster: ReturnType<typeof uniform>;
  uFogColor: { value: Color };
}

const H = VISUAL.atmosphere.haze;

/** Derived fog factor TSL node — wider than `ReturnType<typeof float>` (expression, not VarNode). */
type FogAreaTslNode = ReturnType<typeof float>;

let fogParams: ValleyFogParams = defaultValleyFogParams();
let fogUniforms: ValleyFogUniforms | null = null;
let fogAreaNode: FogAreaTslNode | null = null;
let lastElevationDeg: number = H.fullElevationDeg;

const _tintScratch = new Color();
const _hazeTintScratch: HazeTintParams = { nightColor: '', dayColor: '' };

export function defaultValleyFogParams(): ValleyFogParams {
  return {
    fogBase: H.fogBase,
    fogTop: H.fogTop,
    hazeDensity: H.hazeDensity,
    bandStrength: H.bandStrength,
    noiseScaleA: H.noiseScaleA,
    noiseScaleB: H.noiseScaleB,
    noiseAmplitude: H.noiseAmplitude,
    noiseStrength: H.noiseStrength,
    nightColor: H.nightColor,
    dayColor: H.dayColor,
  };
}

function applyParamsToUniforms(u: ValleyFogUniforms, p: ValleyFogParams): void {
  u.uFogBase.value = p.fogBase;
  u.uFogTop.value = p.fogTop;
  u.uHazeDensity.value = p.hazeDensity;
  u.uBandStrength.value = p.bandStrength;
  u.uNoiseScaleA.value = p.noiseScaleA;
  u.uNoiseScaleB.value = p.noiseScaleB;
  u.uNoiseAmplitude.value = p.noiseAmplitude;
  u.uNoiseStrength.value = p.noiseStrength;
}

/** Assign scene.fogNode — height band + densityFogFactor OR (Three.js webgpu_custom_fog). */
export function initValleyFog(scene: Scene): ValleyFogUniforms {
  const p = fogParams;
  const uFogBase = uniform(p.fogBase);
  const uFogTop = uniform(p.fogTop);
  const uHazeDensity = uniform(p.hazeDensity);
  const uBandStrength = uniform(p.bandStrength);
  const uNoiseScaleA = uniform(p.noiseScaleA);
  const uNoiseScaleB = uniform(p.noiseScaleB);
  const uNoiseAmplitude = uniform(p.noiseAmplitude);
  const uNoiseStrength = uniform(p.noiseStrength);
  const uFogMaster = uniform(H.enabled ? 1 : 0);
  const uFogColor = uniform(new Color(p.dayColor));

  const uTime = uniform(0).onFrameUpdate((frame) => frame.time);

  const fogNoiseA = triNoise3D(positionWorld.mul(uNoiseScaleA), float(0.2), uTime);
  const fogNoiseB = triNoise3D(positionWorld.mul(uNoiseScaleB), float(0.2), uTime.mul(1.2));
  const fogNoise = fogNoiseA.add(fogNoiseB);

  const top = uFogTop.add(fogNoise.sub(0.7).mul(uNoiseAmplitude).mul(uNoiseStrength));
  const groundFogArea = top
    .sub(positionWorld.y)
    .div(top.sub(uFogBase))
    .saturate()
    .mul(uBandStrength);

  const fogDist = densityFogFactor(uHazeDensity);
  const fogArea = groundFogArea.oneMinus().mul(fogDist.oneMinus()).oneMinus().mul(uFogMaster);

  fogAreaNode = fogArea as FogAreaTslNode;
  scene.fogNode = fog(color(uFogColor), fogArea);

  fogUniforms = {
    uFogBase,
    uFogTop,
    uHazeDensity,
    uBandStrength,
    uNoiseScaleA,
    uNoiseScaleB,
    uNoiseAmplitude,
    uNoiseStrength,
    uFogMaster,
    uFogColor,
  };

  return fogUniforms;
}

export function getValleyFogUniforms(): ValleyFogUniforms | null {
  return fogUniforms;
}

/** Shared fog blend factor node — water materials attenuate this near the shore. */
export function getValleyFogAreaNode(): typeof fogAreaNode {
  return fogAreaNode;
}

export function getValleyFogParams(): ValleyFogParams {
  return { ...fogParams };
}

export function setValleyFogParams(params: Partial<ValleyFogParams>): void {
  fogParams = { ...fogParams, ...params };
  if (fogUniforms) applyParamsToUniforms(fogUniforms, fogParams);
}

export function resetValleyFogParams(): void {
  fogParams = defaultValleyFogParams();
  if (fogUniforms) applyParamsToUniforms(fogUniforms, fogParams);
}

function syncFogCycle(elevationDeg: number): void {
  if (!fogUniforms) return;
  if (!H.enabled) {
    fogUniforms.uFogMaster.value = 0;
    return;
  }
  if (import.meta.env.DEV && devSettings.renderDebug.disableHaze) {
    fogUniforms.uFogMaster.value = 0;
    return;
  }
  const nightT = hazeStrengthForElevation(elevationDeg);
  fogUniforms.uFogMaster.value = nightT;
  fogUniforms.uFogTop.value = fogTopForElevation(elevationDeg, fogParams.fogTop);
}

/** Per-frame tint + DEV disable haze. */
export function setValleyFogFromSun(
  elevationDeg: number,
  daylight: number,
  hdriWeight: number,
): void {
  if (!fogUniforms) return;
  lastElevationDeg = elevationDeg;
  _hazeTintScratch.nightColor = fogParams.nightColor;
  _hazeTintScratch.dayColor = fogParams.dayColor;
  sampleHazeTint(elevationDeg, daylight, hdriWeight, _hazeTintScratch, _tintScratch);
  fogUniforms.uFogColor.value.copy(_tintScratch);
  syncFogCycle(elevationDeg);
}

/** Call after render-debug toggles change without a new sun sample. */
export function syncValleyFogDebug(): void {
  syncFogCycle(lastElevationDeg);
}
