// src/rendering/sunShadow/worldCascadeShadow.ts — coarse whole-map sun cascade beyond the far map
import { DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { shadow, uniform } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { TERRAIN_SHADOW_LAYER } from '../../world/terrain/shadow/terrainShadowCast';
import { sunDevState } from '../sunDevState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import { registerCoarseShadowCamera } from './casterMaterial';
import { normalizeSunShadowMapSize } from './setSunShadowMapSize';
import { SUN_SHADOW_FAR_FOLLOW_HALF_M } from './shadowFollowConstants';
import { computeTwistStableLightBasis } from './twistStableLightBasis';
import { createVogelCoverageFilter } from './vogelCoverageFilterTsl';
import {
  disposeWorldShadowVisibility,
  forceWorldShadowVisibilityResolve,
  initWorldShadowVisibility,
  invalidateWorldShadowVisibility,
  resolveWorldShadowVisibility,
  setWorldVisibilityDebugPlayer,
  uWorldVisibilityDistantPushNdc,
  uWorldVisibilityNormalBias,
  uWorldVisibilityPushNdc,
  uWorldVisibilityTerms,
} from './worldShadowVisibility';

type WorldShadowNode = ReturnType<typeof shadow>;

const LIGHT_DISTANCE_M = 4000;
/** Distant channel starts this much before the near/far maps' near plane (no gap). */
const DISTANT_OVERLAP_M = 40;

/** Live-tunable world cascade fields (DEV panel → Shadows → World cascade). */
export type WorldCascadeTune = {
  mapSize: number;
  marginM: number;
  fadeBandM: number;
  refreshAngleDeg: number;
  refreshMinIntervalMs: number;
  refreshMoveM: number;
  normalBias: number;
  /** Receiver push toward the sun (m) in the visibility resolve — see `uWorldVisibilityPushNdc`. */
  pushM: number;
  filterRadiusTexels: number;
  /** Mip-averaged foliage alpha a coarse texel needs to count as occluded. */
  foliageAlphaTest: number;
  /** Sub-texel Halton jitter per bake (texels; 0 = off). */
  jitterTexels: number;
  /** Bakes averaged by the visibility resolve (and idle refinement bakes with a still sun). */
  accumulateBakes: number;
};

function defaultTune(): WorldCascadeTune {
  const c = VISUAL.shadows.lighting.world;
  return {
    mapSize: c.mapSize,
    marginM: c.marginM,
    fadeBandM: c.fadeBandM,
    refreshAngleDeg: c.refreshAngleDeg,
    refreshMinIntervalMs: c.refreshMinIntervalMs,
    refreshMoveM: c.refreshMoveM,
    normalBias: c.normalBias,
    pushM: c.pushM,
    filterRadiusTexels: c.filterRadiusTexels,
    foliageAlphaTest: c.foliageAlphaTest,
    jitterTexels: c.jitterTexels,
    accumulateBakes: c.accumulateBakes,
  };
}

let _tune: WorldCascadeTune = defaultTune();

/** Soft Vogel PCF radius (texels) — blends sub-texel re-bake changes on far casters. */
const uWorldFilterRadiusTexels = uniform(_tune.filterRadiusTexels);
const WorldCoverageShadowFilter = createVogelCoverageFilter(
  VISUAL.shadows.lighting.world.filterSamples,
  uWorldFilterRadiusTexels,
);

/** Read by prop foliage world-casters (see `createMapPropCoarseShadowCastMaterials`). */
export const uWorldFoliageAlphaTest = uniform(_tune.foliageAlphaTest);

type WorldShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof WorldCoverageShadowFilter;
};

/** WebGPU default; raised by SceneSetup when the adapter grants more. */
const DEFAULT_FRAGMENT_TEXTURE_LIMIT = 16;

let worldLight: DirectionalLight | null = null;
let worldShadowNode: WorldShadowNode | null = null;
let fragmentTextureBudget = DEFAULT_FRAGMENT_TEXTURE_LIMIT;
let needsRefresh = true;
let frozen = false;
let bakeCount = 0;
let jitterIndex = 0;
/** Jittered refinement bakes done since the sun last moved. */
let idleBakes = 0;
let renderedBakeCount = 0;
let lastBakeMs = Number.NEGATIVE_INFINITY;
const _bakedSunDir = new Vector3();
const _bakedFocus = new Vector3(Number.NaN, 0, 0);

const _sunDir = new Vector3();
const _farBasis = { focus: new Vector3(), right: new Vector3(), up: new Vector3() };

/** Granted `maxSampledTexturesPerShaderStage` (set once after renderer init). */
export function setFragmentTextureBudget(limit: number): void {
  fragmentTextureBudget = Math.max(DEFAULT_FRAGMENT_TEXTURE_LIMIT, limit);
}

/**
 * Materials already at the 16-texture default (terrain) only take the world cascade when the
 * device granted a higher limit — otherwise the pipeline fails and the mesh disappears.
 */
export function worldCascadeFitsTextureHeavyMaterial(): boolean {
  return fragmentTextureBudget > DEFAULT_FRAGMENT_TEXTURE_LIMIT;
}

/**
 * Far (±200 m main sun map) → world cascade handoff, in the main sun's light-view XY.
 * Written every frame from {@link updateWorldCascadeShadow}.
 */
export const worldCascadeHandoffUniforms = {
  uFarShadowFocus: uniform(new Vector3()),
  uFarLightRight: uniform(new Vector3(1, 0, 0)),
  uFarLightUp: uniform(new Vector3(0, 0, 1)),
  uFarHalfExtentM: uniform(SUN_SHADOW_FAR_FOLLOW_HALF_M),
  uWorldFadeBandM: uniform(_tune.fadeBandM),
  /** 1 = darken the near/far zone with world-map casters the near maps clip (0 = DEV off). */
  uWorldDistantWeight: uniform(1),
};

/**
 * The resolve does its own depth test, pushing receivers toward the sun by `pushM` (NDC =
 * metres / depth range — the same NDC value means ~9× more on this 8 km range than the far map's).
 */
function applyDepthBias(light: DirectionalLight): void {
  const cam = light.shadow.camera;
  light.shadow.bias = 0;
  const range = Math.max(1, cam.far - cam.near);
  uWorldVisibilityPushNdc.value = _tune.pushM / range;
  // The near/far maps clip casters beyond their light distance — keep a margin of overlap.
  uWorldVisibilityDistantPushNdc.value =
    Math.max(_tune.pushM, sunDevState.lightDistance - DISTANT_OVERLAP_M) / range;
}

/**
 * Shadow-only light (intensity 0) with a fixed whole-map ortho square.
 * Own small-radius Vogel PCF (far coverage radii are far too wide at ~1.5 m texels).
 * Call before world materials are built so receivers pick up the world term.
 */
export function createWorldCascadeShadowLight(scene: Scene): DirectionalLight | null {
  if (!VISUAL.shadows.lighting.world.enabled) return null;
  if (worldLight) return worldLight;

  const light = new DirectionalLight(0xffffff, 0);
  light.name = 'worldCascadeShadowLight';
  light.castShadow = true;
  light.shadow.autoUpdate = false;
  light.shadow.mapSize.set(_tune.mapSize, _tune.mapSize);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = LIGHT_DISTANCE_M * 2;
  applyDepthBias(light);
  // Normal offset is applied by the visibility resolve (its quad has no surface normal).
  light.shadow.normalBias = 0;
  light.shadow.camera.layers.enable(TERRAIN_SHADOW_LAYER);
  (light.shadow as WorldShadowWithFilter).filterNode = WorldCoverageShadowFilter;
  registerCoarseShadowCamera(light.shadow.camera);

  scene.add(light);
  scene.add(light.target);
  worldLight = light;
  needsRefresh = true;
  worldShadowNode = shadow(light);
  // Three's lighting reuses this node for the world light instead of creating a competing one.
  (light.shadow as { shadowNode?: unknown }).shadowNode = worldShadowNode;
  if (import.meta.env.DEV) {
    // Count bakes that actually render (not just requests) for the panel / phantom probe.
    const node = worldShadowNode as unknown as { updateShadow: (frame: unknown) => void };
    const render = node.updateShadow.bind(node);
    node.updateShadow = (frame) => {
      renderedBakeCount++;
      render(frame);
    };
  }
  initWorldShadowVisibility(scene, worldShadowNode, light, WorldCoverageShadowFilter as never);
  return light;
}

export function getWorldCascadeShadowLight(): DirectionalLight | null {
  return worldLight;
}

/**
 * DEV debug views. `everywhere` hands off to the world term at 0 m, so it can be compared
 * against the far/near maps around the player; `off` never hands off (no shadows past 200 m).
 */
export type WorldShadowView = 'normal' | 'everywhere' | 'off' | 'castOnly' | 'facetOnly' | 'marker';

let shadowView: WorldShadowView = 'normal';

export function setWorldShadowView(view: WorldShadowView): void {
  shadowView = view;
  worldCascadeHandoffUniforms.uFarHalfExtentM.value =
    view === 'everywhere' || view === 'marker'
      ? 0.001
      : view === 'off'
        ? 1e7
        : SUN_SHADOW_FAR_FOLLOW_HALF_M;
  worldCascadeHandoffUniforms.uWorldDistantWeight.value =
    view === 'off' || view === 'everywhere' || view === 'marker' ? 0 : 1;
  uWorldVisibilityTerms.value =
    view === 'castOnly' ? 1 : view === 'facetOnly' ? 2 : view === 'marker' ? 3 : 0;
  invalidateWorldCascadeShadowMap();
  forceWorldShadowVisibilityResolve();
}

export function getWorldShadowView(): WorldShadowView {
  return shadowView;
}

export function invalidateWorldCascadeShadowMap(): void {
  needsRefresh = true;
  invalidateWorldShadowVisibility();
}

export function getWorldCascadeTune(): Readonly<WorldCascadeTune> {
  return _tune;
}

/** DEV: apply live tune fields (map size re-allocates; bias/margin force a re-bake). */
export function setWorldCascadeTune(partial: Partial<WorldCascadeTune>): void {
  const next = { ..._tune, ...partial };
  next.mapSize = normalizeSunShadowMapSize(next.mapSize);
  _tune = next;
  uWorldFilterRadiusTexels.value = next.filterRadiusTexels;
  uWorldFoliageAlphaTest.value = next.foliageAlphaTest;
  worldCascadeHandoffUniforms.uWorldFadeBandM.value = next.fadeBandM;
  const light = worldLight;
  if (!light) return;
  applyDepthBias(light);
  uWorldVisibilityNormalBias.value = next.normalBias;
  // ShadowNode resizes its own render target on the next bake (the resolve keeps its depth texture).
  if (light.shadow.mapSize.x !== next.mapSize) light.shadow.mapSize.set(next.mapSize, next.mapSize);
  needsRefresh = true;
}

export function resetWorldCascadeTune(): void {
  setWorldCascadeTune(defaultTune());
}

/** DEV: hold the current bake (compare static vs updating far shadows). */
export function setWorldCascadeFrozen(value: boolean): void {
  frozen = value;
  if (!value) needsRefresh = true;
}

export function isWorldCascadeFrozen(): boolean {
  return frozen;
}

/** Total bakes since load — the DEV panel derives bakes/sec from deltas. */
export function getWorldCascadeBakeCount(): number {
  return bakeCount;
}

/** DEV: bakes that actually rendered into the world map (vs requested `bakeCount`). */
export function getWorldCascadeRenderedBakeCount(): number {
  return renderedBakeCount;
}

/**
 * Fixed square (map bounding-sphere radius) so the texel size never changes between bakes —
 * a per-bake AABB refit made the grid "breathe" and far caster shadows swim.
 */
function worldShadowHalfExtentM(): number {
  const h = WORLD.SIZE * 0.5;
  const radius = Math.hypot(h, h, WORLD.HEIGHT_SCALE * 0.5);
  return radius + _tune.marginM;
}

/** Pose at the map centre along the sun with a constant, rotation-invariant ortho square. */
function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}

function poseAndFit(light: DirectionalLight, sunDir: Vector3): void {
  light.target.position.set(0, WORLD.HEIGHT_SCALE * 0.5, 0);
  light.target.updateMatrixWorld();
  light.position.copy(light.target.position).addScaledVector(sunDir, LIGHT_DISTANCE_M);
  light.updateMatrixWorld();

  const half = worldShadowHalfExtentM();
  const cam = light.shadow.camera;
  // Sub-texel Halton(2,3) shift per bake: the resolve averages bakes, so casters thinner than
  // a texel converge to their coverage instead of snapping to one grid (temporal supersampling).
  const texel = (half * 2) / Math.max(1, _tune.mapSize);
  jitterIndex = (jitterIndex % 64) + 1;
  const jx = (halton(jitterIndex, 2) - 0.5) * _tune.jitterTexels * texel;
  const jy = (halton(jitterIndex, 3) - 0.5) * _tune.jitterTexels * texel;
  cam.left = -half + jx;
  cam.right = half + jx;
  cam.bottom = -half + jy;
  cam.top = half + jy;
  cam.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
}

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pantheonWorldShadow = {
    get: getWorldCascadeTune,
    set: setWorldCascadeTune,
    reset: resetWorldCascadeTune,
    freeze: setWorldCascadeFrozen,
    invalidate: invalidateWorldCascadeShadowMap,
    view: setWorldShadowView,
  };
}

/**
 * Per frame: refresh the far→world handoff basis; re-bake the world map only when the sun has
 * turned by `refreshAngleDeg`, the player moved `refreshMoveM` (prop LOD bins), or forced.
 */
export function updateWorldCascadeShadow(
  sun: DirectionalLight,
  playerX: number,
  playerZ: number,
  elevationDeg = currentSunElevationDeg(),
): void {
  if (shadowView === 'marker') setWorldVisibilityDebugPlayer(playerX, playerZ);
  if (worldLight) applyDepthBias(worldLight);
  if (computeTwistStableLightBasis(sun, _farBasis)) {
    (worldCascadeHandoffUniforms.uFarShadowFocus.value as Vector3).copy(_farBasis.focus);
    (worldCascadeHandoffUniforms.uFarLightRight.value as Vector3).copy(_farBasis.right);
    (worldCascadeHandoffUniforms.uFarLightUp.value as Vector3).copy(_farBasis.up);
  }

  const light = worldLight;
  if (!light?.castShadow || sun.intensity <= 0) {
    needsRefresh = true;
    return;
  }
  if (frozen) return;

  sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
  const angleDeg =
    (Math.acos(Math.min(1, Math.max(-1, _sunDir.dot(_bakedSunDir)))) * 180) / Math.PI;
  const moved = Math.hypot(playerX - _bakedFocus.x, playerZ - _bakedFocus.z);
  const sunTrigger =
    needsRefresh || angleDeg >= _tune.refreshAngleDeg || moved >= _tune.refreshMoveM;
  // Still sun: keep adding jittered bakes until the average has converged, then stop.
  const refining =
    !sunTrigger && _tune.jitterTexels > 0 && idleBakes < Math.max(1, _tune.accumulateBakes);
  if (!sunTrigger && !refining) return;
  const now = performance.now();
  if (!needsRefresh && now - lastBakeMs < _tune.refreshMinIntervalMs) return;
  lastBakeMs = now;
  idleBakes = sunTrigger ? 0 : idleBakes + 1;

  poseAndFit(light, _sunDir);
  light.shadow.needsUpdate = true;
  bakeCount++;
  _bakedSunDir.copy(_sunDir);
  _bakedFocus.set(playerX, 0, playerZ);
  needsRefresh = false;
}

/** Allocate + bake once so receivers can sample on the first frames. */
export function warmupWorldCascadeShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
  playerX: number,
  playerZ: number,
): void {
  if (!worldLight?.castShadow || !renderer.shadowMap.enabled) return;
  needsRefresh = true;
  sunDirectionFromSpherical(currentSunElevationDeg(), currentSunAzimuthDeg(), _sunDir);
  poseAndFit(worldLight, _sunDir);
  worldLight.shadow.needsUpdate = true;
  _bakedSunDir.copy(_sunDir);
  _bakedFocus.set(playerX, 0, playerZ);
  needsRefresh = sun.intensity <= 0;
  renderer.render(scene, camera);
}

/**
 * Per tick, before {@link updateWorldCascadeShadow}: fold the bake finished during the previous
 * frame's render into the world-XZ visibility texture receivers sample.
 */
export function resolveWorldCascadeVisibility(renderer: WebGPURenderer): void {
  if (!worldLight?.castShadow) return;
  resolveWorldShadowVisibility(
    renderer,
    bakeCount,
    worldLight.shadow.needsUpdate,
    _bakedSunDir,
    1 / Math.max(1, _tune.accumulateBakes),
  );
}

export function disposeWorldCascadeShadow(): void {
  disposeWorldShadowVisibility();
  if (!worldLight) return;
  const light = worldLight;
  worldLight = null;
  worldShadowNode = null;
  needsRefresh = true;
  light.parent?.remove(light);
  light.target.parent?.remove(light.target);
  light.shadow.map?.dispose();
  light.dispose();
}
