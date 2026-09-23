// src/rendering/atmosphere/atmosphereSystem.ts — scene.fogNode uniforms + day/night cycle sync
import type { Scene, Texture } from 'three';
import { Color, MathUtils } from 'three';
import { color, fog, texture, uniform } from 'three/tsl';
import type { TodStopId } from '../../config/visual/tod';
import { TOD_STOPS } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { devSettings } from '../../core/GameState';
import { createPlaceholderInlandTexture } from '../../map/oceanInlandMask';
import { sampleTodScalar } from '../tod/todBlend';
import {
  type HazeTintParams,
  hazeStrengthForElevation,
  resetHazeCycleParams,
  sampleHazeTint,
} from './atmosphereCycle';
import { createValleyFogAreaNodes, type ValleyFogGraphUniforms } from './atmosphereTsl';

/** Per-stop haze look (tint + density + aerial + sky horizon). */
export type HazeLookStop = {
  tint: string;
  hazeDensity: number;
  aerialStartM: number;
  aerialEndM: number;
  aerialStrength: number;
  aerialNightMul: number;
  skyHorizonStart: number;
  skyHorizonEnd: number;
  /** Day sky/HDRI fog-tint mix at the horizon (0–1); independent of ground aerial. */
  skyHorizonStrength: number;
};

export type HazeLookStops = Record<TodStopId, HazeLookStop>;

export interface ValleyFogParams {
  fogBase: number;
  fogTop: number;
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
  /** Look stops sampled via todWeights. */
  stops: HazeLookStops;
}

export interface ValleyFogUniforms extends ValleyFogGraphUniforms {
  uFogColor: { value: Color };
  uSkyHorizonStart: ReturnType<typeof uniform>;
  uSkyHorizonEnd: ReturnType<typeof uniform>;
  uSkyHorizonStrength: ReturnType<typeof uniform>;
}

const H = VISUAL.atmosphere.haze;

/** Fog factor TSL node shared by scene.fogNode and water. */
type FogAreaTslNode = any;

let fogParams: ValleyFogParams = defaultValleyFogParams();
let fogUniforms: ValleyFogUniforms | null = null;
let fogAreaNode: FogAreaTslNode | null = null;
let fogSkyVolumeNode: FogAreaTslNode | null = null;
let lastElevationDeg: number = H.fullElevationDeg;
/** Editor: no XZ aerial — night valley volume still follows preview. */
let editorOmitsDistanceHaze = false;
const inlandPlaceholder = createPlaceholderInlandTexture();

const _tintScratch = new Color();
const _hazeTintScratch: HazeTintParams = {
  night: '',
  goldenHour: '',
  noon: '',
};

function cloneHazeLookStops(): HazeLookStops {
  return {
    night: { ...H.stops.night },
    goldenHour: { ...H.stops.goldenHour },
    noon: { ...H.stops.noon },
  };
}

export function defaultValleyFogParams(): ValleyFogParams {
  return {
    fogBase: H.fogBase,
    fogTop: H.fogTop,
    valleyRayMaxM: H.valleyRayMaxM,
    valleyAmbientM: H.valleyAmbientM,
    valleyEdgeFadeM: H.valleyEdgeFadeM,
    valleyObscurePower: H.valleyObscurePower,
    valleyInlandStartM: H.valleyInlandStartM,
    valleyInlandEndM: H.valleyInlandEndM,
    stops: cloneHazeLookStops(),
  };
}

/** Shared slab / inland fields only — look uniforms are elevation-sampled. */
function applySharedParamsToUniforms(u: ValleyFogUniforms, p: ValleyFogParams): void {
  u.uFogBase.value = p.fogBase;
  u.uFogTop.value = p.fogTop;
  u.uValleyRayMaxM.value = p.valleyRayMaxM;
  u.uValleyAmbientM.value = p.valleyAmbientM;
  u.uValleyEdgeFadeM.value = p.valleyEdgeFadeM;
  u.uValleyObscurePower.value = Math.max(1, p.valleyObscurePower);
  u.uInlandStartM.value = p.valleyInlandStartM;
  u.uInlandEndM.value = Math.max(p.valleyInlandEndM, p.valleyInlandStartM + 1);
}

function sampleLookScalar(key: Exclude<keyof HazeLookStop, 'tint'>, elevationDeg: number): number {
  const { stops } = fogParams;
  return sampleTodScalar(
    {
      night: stops.night[key],
      goldenHour: stops.goldenHour[key],
      noon: stops.noon[key],
    },
    elevationDeg,
  );
}

function liveAerialStrength(
  nightMaster: number,
  aerialStrength: number,
  aerialNightMul: number,
): number {
  const nightMul = MathUtils.clamp(aerialNightMul, 0, 1);
  return aerialStrength * (1 - nightMaster * (1 - nightMul));
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
  const noon = p.stops.noon;
  const uFogBase = uniform(p.fogBase);
  const uFogTop = uniform(p.fogTop);
  const uHazeDensity = uniform(noon.hazeDensity);
  const uValleyRayMaxM = uniform(p.valleyRayMaxM);
  const uValleyAmbientM = uniform(p.valleyAmbientM);
  const uValleyEdgeFadeM = uniform(p.valleyEdgeFadeM);
  const uValleyObscurePower = uniform(Math.max(1, p.valleyObscurePower));
  const uFogMaster = uniform(H.enabled ? 1 : 0);
  const uFogColor = uniform(new Color(noon.tint));
  const uAerialStartM = uniform(noon.aerialStartM);
  const uAerialEndM = uniform(Math.max(noon.aerialEndM, noon.aerialStartM + 1));
  const uAerialStrength = uniform(H.enabled ? noon.aerialStrength : 0);
  const uSkyHorizonStart = uniform(noon.skyHorizonStart);
  const uSkyHorizonEnd = uniform(Math.max(noon.skyHorizonEnd, noon.skyHorizonStart + 1e-4));
  const uSkyHorizonStrength = uniform(H.enabled ? noon.skyHorizonStrength : 0);
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
  const { skyVolume, fogArea } = createValleyFogAreaNodes(graph);

  fogSkyVolumeNode = skyVolume;
  fogAreaNode = fogArea;
  scene.fogNode = fog(color(uFogColor), fogArea);

  fogUniforms = {
    ...graph,
    uFogColor,
    uSkyHorizonStart,
    uSkyHorizonEnd,
    uSkyHorizonStrength,
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

export function getValleyFogParams(): ValleyFogParams {
  return {
    ...fogParams,
    stops: {
      night: { ...fogParams.stops.night },
      goldenHour: { ...fogParams.stops.goldenHour },
      noon: { ...fogParams.stops.noon },
    },
  };
}

export function setValleyFogParams(params: Partial<ValleyFogParams>): void {
  if (params.stops) {
    const nextStops = { ...fogParams.stops };
    for (const stop of TOD_STOPS) {
      if (params.stops[stop]) {
        nextStops[stop] = { ...fogParams.stops[stop], ...params.stops[stop] };
      }
    }
    fogParams = { ...fogParams, ...params, stops: nextStops };
  } else {
    fogParams = { ...fogParams, ...params };
  }
  if (fogUniforms) applySharedParamsToUniforms(fogUniforms, fogParams);
  syncFogCycle(lastElevationDeg);
}

/** Patch one look field on a TOD stop (DEV ToD panel). */
export function setValleyFogLookStop(stop: TodStopId, partial: Partial<HazeLookStop>): void {
  fogParams.stops[stop] = { ...fogParams.stops[stop], ...partial };
  syncFogCycle(lastElevationDeg);
}

export function resetValleyFogParams(): void {
  resetHazeCycleParams();
  fogParams = defaultValleyFogParams();
  if (fogUniforms) applySharedParamsToUniforms(fogUniforms, fogParams);
  syncFogCycle(lastElevationDeg);
}

function syncFogCycle(elevationDeg: number): void {
  if (!fogUniforms) return;
  if (hazeConfigOff()) {
    fogUniforms.uFogMaster.value = 0;
    fogUniforms.uAerialStrength.value = 0;
    fogUniforms.uSkyHorizonStrength.value = 0;
    return;
  }

  const density = sampleLookScalar('hazeDensity', elevationDeg);
  const aerialStartM = sampleLookScalar('aerialStartM', elevationDeg);
  const aerialEndM = sampleLookScalar('aerialEndM', elevationDeg);
  const aerialStrength = sampleLookScalar('aerialStrength', elevationDeg);
  const aerialNightMul = sampleLookScalar('aerialNightMul', elevationDeg);
  const skyHorizonStart = sampleLookScalar('skyHorizonStart', elevationDeg);
  const skyHorizonEnd = sampleLookScalar('skyHorizonEnd', elevationDeg);
  const skyHorizonStrength = sampleLookScalar('skyHorizonStrength', elevationDeg);

  fogUniforms.uHazeDensity.value = density;
  fogUniforms.uAerialStartM.value = aerialStartM;
  fogUniforms.uAerialEndM.value = Math.max(aerialEndM, aerialStartM + 1);
  fogUniforms.uSkyHorizonStart.value = skyHorizonStart;
  fogUniforms.uSkyHorizonEnd.value = Math.max(skyHorizonEnd, skyHorizonStart + 1e-4);

  if (editorOmitsDistanceHaze) {
    fogUniforms.uAerialStrength.value = 0;
    fogUniforms.uSkyHorizonStrength.value = 0;
    return;
  }
  const nightMaster = debugDisableValleyFog() ? 0 : hazeStrengthForElevation(elevationDeg);
  fogUniforms.uFogMaster.value = nightMaster;
  const distanceOff = debugDisableDistanceHaze();
  fogUniforms.uAerialStrength.value = distanceOff
    ? 0
    : liveAerialStrength(nightMaster, aerialStrength, aerialNightMul);
  // Horizon overlay tracks the same isolate + night fade as ground aerial, but its
  // look strength is independent (skyHorizonStrength vs aerialStrength).
  fogUniforms.uSkyHorizonStrength.value = distanceOff
    ? 0
    : liveAerialStrength(nightMaster, skyHorizonStrength, aerialNightMul);
}

/** Per-frame tint (same night master as `uFogMaster`) + DEV isolate valley fog / distance haze. */
export function setValleyFogFromSun(elevationDeg: number): void {
  if (!fogUniforms) return;
  lastElevationDeg = elevationDeg;
  _hazeTintScratch.night = fogParams.stops.night.tint;
  _hazeTintScratch.goldenHour = fogParams.stops.goldenHour.tint;
  _hazeTintScratch.noon = fogParams.stops.noon.tint;
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
  fogUniforms.uSkyHorizonStrength.value = 0;
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
    fogUniforms.uFogColor.value.set(fogParams.stops.night.tint);
  } else {
    fogUniforms.uFogMaster.value = 0;
  }
}
