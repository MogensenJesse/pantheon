// src/rendering/atmosphere/atmosphereSystem.ts — scene.fogNode uniforms + day/night cycle sync
import type { Scene, Texture } from 'three';
import { Color, MathUtils } from 'three';
import { color, fog, texture, uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { devSettings } from '../../core/GameState';
import { createPlaceholderInlandTexture } from '../../map/oceanInlandMask';
import {
  type HazeTintParams,
  hazeStrengthForElevation,
  resetHazeCycleParams,
  sampleHazeTint,
} from './atmosphereCycle';
import { createValleyFogAreaNodes, type ValleyFogGraphUniforms } from './atmosphereTsl';

export interface ValleyFogParams {
  fogBase: number;
  fogTop: number;
  /**
   * Night valley volume — Beer-Lambert along the view ray. Path uses the
   * `fogBase`..`fogTop` layer (ridge look); under the ceiling a surround veil
   * fills sky and distant ground even when the camera is below `fogBase`.
   */
  hazeDensity: number;
  nightColor: string;
  dayColor: string;
  /** Cap on slab path length (m) so a long look does not become a solid wall. */
  valleyRayMaxM: number;
  /** Extra optical path (m) when the camera is under `fogTop` (near veil). */
  valleyAmbientM: number;
  /** Metres below `fogTop` where density ramps to 0 (soft ceiling / walk-in). */
  valleyEdgeFadeM: number;
  /** Surround mix exponent on fade height (1 = tracks fade, >1 = slower obscuring). */
  valleyObscurePower: number;
  /** Metres from ocean where night valley mist begins (0 = still sea). */
  valleyInlandStartM: number;
  /** Metres from ocean where night valley mist is full. */
  valleyInlandEndM: number;
  /** Camera-XZ smoothstep start (m) for always-on day aerial. */
  aerialStartM: number;
  /** Camera-XZ smoothstep end (m). */
  aerialEndM: number;
  /** Fog factor at `aerialEndM` (0 = off, 1 = full mix toward tint). */
  aerialStrength: number;
  /** Fraction of `aerialStrength` still applied at full night. */
  aerialNightMul: number;
  /** |viewDir.y| where sky horizon mix is full (0 = geometric horizon). */
  skyHorizonStart: number;
  /** |viewDir.y| where sky horizon mix reaches 0 (clear zenith). */
  skyHorizonEnd: number;
}

export interface ValleyFogUniforms extends ValleyFogGraphUniforms {
  uFogColor: { value: Color };
  uSkyHorizonStart: ReturnType<typeof uniform>;
  uSkyHorizonEnd: ReturnType<typeof uniform>;
}

const H = VISUAL.atmosphere.haze;

/** Fog factor TSL node shared by scene.fogNode, water, and clouds. */
type FogAreaTslNode = any;

let fogParams: ValleyFogParams = defaultValleyFogParams();
let fogUniforms: ValleyFogUniforms | null = null;
let fogAreaNode: FogAreaTslNode | null = null;
let fogNightAreaNode: FogAreaTslNode | null = null;
let fogSkyVolumeNode: FogAreaTslNode | null = null;
let lastElevationDeg: number = H.fullElevationDeg;
/** Editor: no XZ aerial — night valley volume still follows preview. */
let editorOmitsDistanceHaze = false;
const inlandPlaceholder = createPlaceholderInlandTexture();

const _tintScratch = new Color();
const _hazeTintScratch: HazeTintParams = { nightColor: '', dayColor: '' };

export function defaultValleyFogParams(): ValleyFogParams {
  return {
    fogBase: H.fogBase,
    fogTop: H.fogTop,
    hazeDensity: H.hazeDensity,
    nightColor: H.nightColor,
    dayColor: H.dayColor,
    valleyRayMaxM: H.valleyRayMaxM,
    valleyAmbientM: H.valleyAmbientM,
    valleyEdgeFadeM: H.valleyEdgeFadeM,
    valleyObscurePower: H.valleyObscurePower,
    valleyInlandStartM: H.valleyInlandStartM,
    valleyInlandEndM: H.valleyInlandEndM,
    aerialStartM: H.aerialStartM,
    aerialEndM: H.aerialEndM,
    aerialStrength: H.aerialStrength,
    aerialNightMul: H.aerialNightMul,
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
  u.uValleyObscurePower.value = Math.max(1, p.valleyObscurePower);
  u.uInlandStartM.value = p.valleyInlandStartM;
  u.uInlandEndM.value = Math.max(p.valleyInlandEndM, p.valleyInlandStartM + 1);
  u.uAerialStartM.value = p.aerialStartM;
  u.uAerialEndM.value = Math.max(p.aerialEndM, p.aerialStartM + 1);
  u.uSkyHorizonStart.value = p.skyHorizonStart;
  u.uSkyHorizonEnd.value = Math.max(p.skyHorizonEnd, p.skyHorizonStart + 1e-4);
}

function liveAerialStrength(nightMaster: number, p: ValleyFogParams): number {
  const nightMul = MathUtils.clamp(p.aerialNightMul, 0, 1);
  return p.aerialStrength * (1 - nightMaster * (1 - nightMul));
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
  const uValleyObscurePower = uniform(Math.max(1, p.valleyObscurePower));
  const uFogMaster = uniform(H.enabled ? 1 : 0);
  const uFogColor = uniform(new Color(p.dayColor));
  const uAerialStartM = uniform(p.aerialStartM);
  const uAerialEndM = uniform(Math.max(p.aerialEndM, p.aerialStartM + 1));
  const uAerialStrength = uniform(H.enabled ? p.aerialStrength : 0);
  const uSkyHorizonStart = uniform(p.skyHorizonStart);
  const uSkyHorizonEnd = uniform(Math.max(p.skyHorizonEnd, p.skyHorizonStart + 1e-4));
  const uInlandTex = texture(inlandPlaceholder);
  const uWorldSize = uniform(WORLD.SIZE);
  const uInlandStartM = uniform(p.valleyInlandStartM);
  const uInlandEndM = uniform(Math.max(p.valleyInlandEndM, p.valleyInlandStartM + 1));

  const graph: ValleyFogGraphUniforms = {
    uFogBase,
    uFogTop,
    uHazeDensity,
    uValleyRayMaxM,
    uValleyAmbientM,
    uValleyEdgeFadeM,
    uValleyObscurePower,
    uFogMaster,
    uAerialStartM,
    uAerialEndM,
    uAerialStrength,
    uInlandTex,
    uWorldSize,
    uInlandStartM,
    uInlandEndM,
  };
  // Keep scene.fogNode attached always — swapping it at runtime recompiles every fogged material.
  const { nightArea, skyVolume, fogArea } = createValleyFogAreaNodes(graph);

  fogNightAreaNode = nightArea;
  fogSkyVolumeNode = skyVolume;
  fogAreaNode = fogArea;
  scene.fogNode = fog(color(uFogColor), fogArea);

  fogUniforms = {
    ...graph,
    uFogColor,
    uSkyHorizonStart,
    uSkyHorizonEnd,
  };

  return fogUniforms;
}

export function getValleyFogUniforms(): ValleyFogUniforms | null {
  return fogUniforms;
}

/** Swap the inland-distance map after terrain bake. `null` restores the fully-inland placeholder. */
export function bindValleyFogInlandMask(tex: Texture | null): void {
  if (!fogUniforms) return;
  fogUniforms.uInlandTex.value = tex ?? inlandPlaceholder;
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
  const nightMaster = debugDisableValleyFog() ? 0 : hazeStrengthForElevation(elevationDeg);
  fogUniforms.uFogMaster.value = nightMaster;
  fogUniforms.uAerialStrength.value = debugDisableDistanceHaze()
    ? 0
    : liveAerialStrength(nightMaster, fogParams);
  fogUniforms.uAerialStartM.value = fogParams.aerialStartM;
  fogUniforms.uAerialEndM.value = Math.max(fogParams.aerialEndM, fogParams.aerialStartM + 1);
}

/** Per-frame tint (same night master as `uFogMaster`) + DEV isolate valley fog / distance haze. */
export function setValleyFogFromSun(elevationDeg: number): void {
  if (!fogUniforms) return;
  lastElevationDeg = elevationDeg;
  _hazeTintScratch.nightColor = fogParams.nightColor;
  _hazeTintScratch.dayColor = fogParams.dayColor;
  sampleHazeTint(elevationDeg, _hazeTintScratch, _tintScratch);
  fogUniforms.uFogColor.value.copy(_tintScratch);
  syncFogCycle(elevationDeg);
}

/** Call after render-debug toggles change without a new sun sample. */
export function syncValleyFogDebug(): void {
  syncFogCycle(lastElevationDeg);
}

/** Editor always omits distance haze — night valley volume still follows preview. */
export function initValleyFogEditorAtmosphere(): void {
  editorOmitsDistanceHaze = true;
  if (!fogUniforms) return;
  fogUniforms.uAerialStrength.value = 0;
}

/**
 * Editor fog preview — keep `scene.fogNode` attached (swapping it recompiles fogged materials).
 * Off: night master 0. On: full night slab with night tint. Distance haze stays off.
 */
export function setValleyFogEditorPreview(enabled: boolean): void {
  if (!fogUniforms) return;
  initValleyFogEditorAtmosphere();
  if (enabled) {
    fogUniforms.uFogMaster.value = 1;
    fogUniforms.uFogColor.value.set(fogParams.nightColor);
  } else {
    fogUniforms.uFogMaster.value = 0;
  }
}
