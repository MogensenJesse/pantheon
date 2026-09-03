// src/rendering/atmosphere/valleyFog.ts — scene.fogNode day aerial + night valley (webgpu_custom_fog)
import type { Scene } from 'three';
import { Color } from 'three';
import {
  cameraPosition,
  color,
  Fn,
  float,
  fog,
  If,
  length,
  max,
  positionWorld,
  positionWorldDirection,
  smoothstep,
  uniform,
  vec2,
} from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import {
  fogTopForElevation,
  hazeStrengthForElevation,
  resetHazeCycleParams,
} from './hazeCycleStrength';
import { heightSlabFogFactor } from './heightSlabFogTsl';
import { type HazeTintParams, sampleHazeTint } from './sampleHazeTint';

export interface ValleyFogParams {
  fogBase: number;
  fogTop: number;
  /**
   * Night valley volume — Beer-Lambert extinction along the view ray through
   * the world-Y slab (`fogBase`..`fogTop`).
   */
  hazeDensity: number;
  bandStrength: number;
  nightColor: string;
  dayColor: string;
  /** Cap on slab path length (m) so a long look does not become a solid wall. */
  valleyRayMaxM: number;
  /** Extra optical path (m) when the camera is inside the slab (near veil). */
  valleyAmbientM: number;
  /** Metres below `fogTop` where density ramps to 0 (soft ceiling / walk-in). */
  valleyEdgeFadeM: number;
  /** Camera-XZ smoothstep start (m) for always-on day aerial. */
  aerialStartM: number;
  /** Camera-XZ smoothstep end (m). */
  aerialEndM: number;
  /** Fog factor at `aerialEndM` (0 = off, 1 = full mix toward tint). */
  aerialStrength: number;
  /** |viewDir.y| where sky horizon mix is full (0 = geometric horizon). */
  skyHorizonStart: number;
  /** |viewDir.y| where sky horizon mix reaches 0 (clear zenith). */
  skyHorizonEnd: number;
}

export interface ValleyFogUniforms {
  uFogBase: ReturnType<typeof uniform>;
  uFogTop: ReturnType<typeof uniform>;
  uHazeDensity: ReturnType<typeof uniform>;
  uValleyRayMaxM: ReturnType<typeof uniform>;
  uValleyAmbientM: ReturnType<typeof uniform>;
  uValleyEdgeFadeM: ReturnType<typeof uniform>;
  uBandStrength: ReturnType<typeof uniform>;
  uFogMaster: ReturnType<typeof uniform>;
  uFogColor: { value: Color };
  uAerialStartM: ReturnType<typeof uniform>;
  uAerialEndM: ReturnType<typeof uniform>;
  uAerialStrength: ReturnType<typeof uniform>;
  uSkyHorizonStart: ReturnType<typeof uniform>;
  uSkyHorizonEnd: ReturnType<typeof uniform>;
}

const H = VISUAL.atmosphere.haze;

/**
 * Below this master / aerial strength, skip the matching TSL branch.
 * Must use TSL `If` + `toVar` — `select()` / mix still evaluates both sides in WGSL.
 */
const FOG_ACTIVE_EPS = 0.001;

/**
 * Sky/HDRI segment length (m). Optical path still caps at `valleyRayMaxM`.
 * Must be long enough to reach a low valley slab from a high ridge.
 */
const VALLEY_SKY_TRACE_M = 2200;

/** Fog factor TSL node shared by scene.fogNode, water, and clouds. */
type FogAreaTslNode = any;

let fogParams: ValleyFogParams = defaultValleyFogParams();
let fogUniforms: ValleyFogUniforms | null = null;
let fogAreaNode: FogAreaTslNode | null = null;
let fogNightAreaNode: FogAreaTslNode | null = null;
let fogSkyVolumeNode: FogAreaTslNode | null = null;
let valleyFogNode: ReturnType<typeof fog> | null = null;
let lastElevationDeg: number = H.fullElevationDeg;
/** Editor: no XZ aerial — night valley volume still follows preview. */
let editorOmitsDistanceHaze = false;

const _tintScratch = new Color();
const _hazeTintScratch: HazeTintParams = { nightColor: '', dayColor: '' };

export function defaultValleyFogParams(): ValleyFogParams {
  return {
    fogBase: H.fogBase,
    fogTop: H.fogTop,
    hazeDensity: H.hazeDensity,
    bandStrength: H.bandStrength,
    nightColor: H.nightColor,
    dayColor: H.dayColor,
    valleyRayMaxM: H.valleyRayMaxM,
    valleyAmbientM: H.valleyAmbientM,
    valleyEdgeFadeM: H.valleyEdgeFadeM,
    aerialStartM: H.aerialStartM,
    aerialEndM: H.aerialEndM,
    aerialStrength: H.aerialStrength,
    skyHorizonStart: H.skyHorizonStart,
    skyHorizonEnd: H.skyHorizonEnd,
  };
}

function applyParamsToUniforms(u: ValleyFogUniforms, p: ValleyFogParams): void {
  u.uFogBase.value = p.fogBase;
  u.uFogTop.value = p.fogTop;
  u.uHazeDensity.value = p.hazeDensity;
  u.uValleyRayMaxM.value = p.valleyRayMaxM;
  u.uValleyAmbientM.value = p.valleyAmbientM;
  u.uValleyEdgeFadeM.value = p.valleyEdgeFadeM;
  u.uBandStrength.value = p.bandStrength;
  u.uAerialStartM.value = p.aerialStartM;
  u.uAerialEndM.value = Math.max(p.aerialEndM, p.aerialStartM + 1);
  u.uSkyHorizonStart.value = p.skyHorizonStart;
  u.uSkyHorizonEnd.value = Math.max(p.skyHorizonEnd, p.skyHorizonStart + 1e-4);
}

function hazeConfigOff(): boolean {
  return !H.enabled;
}

function debugDisableValleyFog(): boolean {
  return import.meta.env.DEV && devSettings.renderDebug.disableValleyFog;
}

function debugDisableDistanceHaze(): boolean {
  return import.meta.env.DEV && devSettings.renderDebug.disableDistanceHaze;
}

/** Assign scene.fogNode — XZ day aerial OR night valley volume, combined as 1-(1-d)*(1-n). */
export function initValleyFog(scene: Scene): ValleyFogUniforms {
  const p = fogParams;
  const uFogBase = uniform(p.fogBase);
  const uFogTop = uniform(p.fogTop);
  const uHazeDensity = uniform(p.hazeDensity);
  const uValleyRayMaxM = uniform(p.valleyRayMaxM);
  const uValleyAmbientM = uniform(p.valleyAmbientM);
  const uValleyEdgeFadeM = uniform(p.valleyEdgeFadeM);
  const uBandStrength = uniform(p.bandStrength);
  const uFogMaster = uniform(H.enabled ? 1 : 0);
  const uFogColor = uniform(new Color(p.dayColor));
  const uAerialStartM = uniform(p.aerialStartM);
  const uAerialEndM = uniform(Math.max(p.aerialEndM, p.aerialStartM + 1));
  const uAerialStrength = uniform(H.enabled ? p.aerialStrength : 0);
  const uSkyHorizonStart = uniform(p.skyHorizonStart);
  const uSkyHorizonEnd = uniform(Math.max(p.skyHorizonEnd, p.skyHorizonStart + 1e-4));

  const nightVolumeAt = (endP: FogAreaTslNode) => {
    return heightSlabFogFactor(
      cameraPosition,
      endP,
      uFogBase,
      uFogTop,
      uHazeDensity,
      uValleyRayMaxM,
      uValleyAmbientM,
      uValleyEdgeFadeM,
    )
      .mul(uFogMaster)
      .mul(uBandStrength);
  };

  // Keep scene.fogNode attached always — swapping it at runtime recompiles every fogged material.
  const nightArea = Fn(() => {
    const out = float(0).toVar();
    If(uFogMaster.greaterThan(FOG_ACTIVE_EPS), () => {
      out.assign(nightVolumeAt(positionWorld));
    });
    return out;
  })();

  const skyVolume = Fn(() => {
    const out = float(0).toVar();
    If(uFogMaster.greaterThan(FOG_ACTIVE_EPS), () => {
      const endP = cameraPosition.add(positionWorldDirection.mul(float(VALLEY_SKY_TRACE_M)));
      out.assign(nightVolumeAt(endP));
    });
    return out;
  })();

  const dayArea = Fn(() => {
    const out = float(0).toVar();
    If(uAerialStrength.greaterThan(FOG_ACTIVE_EPS), () => {
      const camXZ = vec2(cameraPosition.x, cameraPosition.z);
      const worldXZ = vec2(positionWorld.x, positionWorld.z);
      const dist = length(worldXZ.sub(camXZ));
      const endM = max(uAerialEndM, uAerialStartM.add(float(1)));
      out.assign(smoothstep(uAerialStartM, endM, dist).mul(uAerialStrength).saturate());
    });
    return out;
  })();

  const fogArea = dayArea.oneMinus().mul(nightArea.oneMinus()).oneMinus();

  fogNightAreaNode = nightArea;
  fogSkyVolumeNode = skyVolume;
  fogAreaNode = fogArea;
  valleyFogNode = fog(color(uFogColor), fogArea);
  scene.fogNode = valleyFogNode;

  fogUniforms = {
    uFogBase,
    uFogTop,
    uHazeDensity,
    uValleyRayMaxM,
    uValleyAmbientM,
    uValleyEdgeFadeM,
    uBandStrength,
    uFogMaster,
    uFogColor,
    uAerialStartM,
    uAerialEndM,
    uAerialStrength,
    uSkyHorizonStart,
    uSkyHorizonEnd,
  };

  return fogUniforms;
}

export function getValleyFogUniforms(): ValleyFogUniforms | null {
  return fogUniforms;
}

/** Night valley volume along a sky/HDRI view ray (camera + dir × rayMax). */
export function getValleyFogSkyVolumeNode(): typeof fogSkyVolumeNode {
  return fogSkyVolumeNode;
}

/** Combined day aerial + night valley — water and scene.fogNode. */
export function getValleyFogAreaNode(): typeof fogAreaNode {
  return fogAreaNode;
}

/** Night valley term only — cloud meshes keep their own night hazeMix and skip noon aerial. */
export function getValleyFogNightAreaNode(): typeof fogNightAreaNode {
  return fogNightAreaNode;
}

export function getValleyFogParams(): ValleyFogParams {
  return { ...fogParams };
}

export function setValleyFogParams(params: Partial<ValleyFogParams>): void {
  fogParams = { ...fogParams, ...params };
  if (fogUniforms) applyParamsToUniforms(fogUniforms, fogParams);
  syncFogCycle(lastElevationDeg);
}

export function resetValleyFogParams(): void {
  resetHazeCycleParams();
  fogParams = defaultValleyFogParams();
  if (fogUniforms) applyParamsToUniforms(fogUniforms, fogParams);
  syncFogCycle(lastElevationDeg);
}

function syncFogCycle(elevationDeg: number): void {
  if (!fogUniforms) return;
  if (hazeConfigOff()) {
    fogUniforms.uFogMaster.value = 0;
    fogUniforms.uAerialStrength.value = 0;
    return;
  }
  if (editorOmitsDistanceHaze) {
    fogUniforms.uAerialStrength.value = 0;
    return;
  }
  fogUniforms.uFogMaster.value = debugDisableValleyFog()
    ? 0
    : hazeStrengthForElevation(elevationDeg);
  fogUniforms.uFogTop.value = fogTopForElevation(elevationDeg, fogParams.fogTop);
  fogUniforms.uAerialStrength.value = debugDisableDistanceHaze() ? 0 : fogParams.aerialStrength;
  fogUniforms.uAerialStartM.value = fogParams.aerialStartM;
  fogUniforms.uAerialEndM.value = Math.max(fogParams.aerialEndM, fogParams.aerialStartM + 1);
}

/** Per-frame tint (`dayT` + HDRI pull) + DEV isolate valley fog / distance haze. */
export function setValleyFogFromSun(elevationDeg: number, hdriWeight: number): void {
  if (!fogUniforms) return;
  lastElevationDeg = elevationDeg;
  _hazeTintScratch.nightColor = fogParams.nightColor;
  _hazeTintScratch.dayColor = fogParams.dayColor;
  sampleHazeTint(elevationDeg, hdriWeight, _hazeTintScratch, _tintScratch);
  fogUniforms.uFogColor.value.copy(_tintScratch);
  syncFogCycle(elevationDeg);
}

/** Call after render-debug toggles change without a new sun sample. */
export function syncValleyFogDebug(): void {
  syncFogCycle(lastElevationDeg);
}

/** Direct master strength (0 = off, 1 = full). */
export function setValleyFogMasterStrength(master: number): void {
  if (!fogUniforms) return;
  fogUniforms.uFogMaster.value = master;
}

/** Editor always omits distance haze — night valley volume still follows preview. */
export function initValleyFogEditorAtmosphere(): void {
  editorOmitsDistanceHaze = true;
  if (!fogUniforms) return;
  fogUniforms.uAerialStrength.value = 0;
}

/**
 * Editor preview — detach scene.fogNode when off so props/terrain/water all stop fogging.
 * When on, uses static midday tint. Distance haze stays off in the editor.
 */
export function setValleyFogEditorPreview(scene: Scene, enabled: boolean): void {
  if (!fogUniforms || !valleyFogNode) return;
  initValleyFogEditorAtmosphere();
  if (enabled) {
    scene.fogNode = valleyFogNode;
    fogUniforms.uFogMaster.value = 1;
    fogUniforms.uFogColor.value.set(fogParams.dayColor);
  } else {
    scene.fogNode = null;
    fogUniforms.uFogMaster.value = 0;
  }
}
