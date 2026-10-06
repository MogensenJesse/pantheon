// src/rendering/sunShadow/worldCascadeShadow.ts — coarse whole-map sun cascade beyond the far map
import { DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import { shadow, uniform } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { sunDevState } from '../sunDevState';
import {
  currentSunAzimuthDeg,
  currentSunElevationDeg,
  sunDirectionFromSpherical,
} from '../sunSpherical';
import { registerCoarseShadowCamera } from './casterMaterial';
import { SUN_SHADOW_FAR_FOLLOW_HALF_M } from './shadowFollowConstants';
import { normalizeShadowMapSize } from './shadowMapSize';
import { createVogelPcfFilter } from './vogelPcfFilter';
import { syncWorldHandoffBasis, worldCascadeHandoffUniforms } from './worldCascadeHandoffUniforms';
import {
  disposeWorldShadowVisibility,
  initWorldShadowVisibility,
  resetWorldVisibility,
  resolveWorldVisibility,
  setWorldVisibilityBias,
  setWorldVisibilityTerms,
} from './worldShadowVisibility';

type ShadowNode = ReturnType<typeof shadow>;

const LIGHT_DISTANCE_M = 4000;
/** The near/far maps clip casters beyond their light distance; the G channel starts this much earlier so the two overlap. */
const DISTANT_OVERLAP_M = 40;
/** A sun jump bigger than this between bakes makes blended history meaningless: overwrite it. */
const SUN_JUMP_RESET_DEG = 2;

/** Live-tunable world cascade fields (DEV panel → Shadows → World cascade). */
export type WorldCascadeTune = {
  mapSize: number;
  marginM: number;
  fadeBandM: number;
  refreshAngleDeg: number;
  refreshMinIntervalMs: number;
  refreshMoveM: number;
  normalBias: number;
  pushM: number;
  filterRadiusTexels: number;
  /** Mip-averaged foliage alpha a coarse texel needs to count as occluded. */
  foliageAlphaTest: number;
  /** Sub-texel Halton jitter per bake (texels; 0 = off). */
  jitterTexels: number;
  /** Bakes averaged by the visibility resolve; also the idle refinement bakes with a still sun. */
  accumulateBakes: number;
};

/** DEV views: `everywhere` hands off to the world term at 0 m; `off` never hands off. */
export type WorldShadowView = 'normal' | 'everywhere' | 'off' | 'castOnly' | 'facetOnly';

export function getWorldCascadeDefaults(): WorldCascadeTune {
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

let _tune: WorldCascadeTune = getWorldCascadeDefaults();

const uWorldFilterRadiusTexels = uniform(_tune.filterRadiusTexels);
const WorldPcfFilter = createVogelPcfFilter(
  VISUAL.shadows.lighting.world.filterSamples,
  uWorldFilterRadiusTexels,
);

/** Read by the prop foliage world casters (`createMapPropCoarseShadowCastMaterials`). */
export const uWorldFoliageAlphaTest = uniform(_tune.foliageAlphaTest);

type WorldShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof WorldPcfFilter;
};

interface CascadeState {
  light: DirectionalLight | null;
  node: ShadowNode | null;
  needsRefresh: boolean;
  frozen: boolean;
  view: WorldShadowView;
  bakeCount: number;
  jitterIndex: number;
  /** Jittered refinement bakes since the sun last moved. */
  idleBakes: number;
  lastBakeMs: number;
}

const freshState = (): CascadeState => ({
  light: null,
  node: null,
  needsRefresh: true,
  frozen: false,
  view: 'normal',
  bakeCount: 0,
  jitterIndex: 0,
  idleBakes: 0,
  lastBakeMs: Number.NEGATIVE_INFINITY,
});

let S = freshState();
const _bakedSunDir = new Vector3();
const _bakedFocus = new Vector3(Number.NaN, 0, 0);
const _sunDir = new Vector3();

function applyTuneUniforms(): void {
  uWorldFilterRadiusTexels.value = _tune.filterRadiusTexels;
  uWorldFoliageAlphaTest.value = _tune.foliageAlphaTest;
  worldCascadeHandoffUniforms.uWorldFadeBandM.value = _tune.fadeBandM;
}

/**
 * The resolve does its own depth test. NDC bias scales with the shadow camera's depth range, so
 * pushes are given in metres here (this 8 km range makes the same NDC value ~9× larger than on
 * the far map).
 */
function syncResolveBias(light: DirectionalLight): void {
  const cam = light.shadow.camera;
  const range = Math.max(1, cam.far - cam.near);
  setWorldVisibilityBias({
    normalBiasM: _tune.normalBias,
    pushNdc: _tune.pushM / range,
    distantPushNdc: Math.max(_tune.pushM, sunDevState.lightDistance - DISTANT_OVERLAP_M) / range,
  });
}

/**
 * Shadow-only light (intensity 0) with a fixed whole-map ortho square and its own small-radius
 * Vogel PCF (the far map's radius is far too wide at ~1.5 m texels). Call before world materials
 * are built so receivers pick up the world term.
 */
export function createWorldCascadeShadowLight(scene: Scene): DirectionalLight | null {
  if (!VISUAL.shadows.lighting.world.enabled) return null;
  if (S.light) return S.light;

  const light = new DirectionalLight(0xffffff, 0);
  light.name = 'worldCascadeShadowLight';
  light.castShadow = true;
  light.shadow.autoUpdate = false;
  light.shadow.mapSize.set(_tune.mapSize, _tune.mapSize);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = LIGHT_DISTANCE_M * 2;
  // shadow.bias / normalBias stay 0: the visibility resolve applies its own push + normal offset.
  (light.shadow as WorldShadowWithFilter).filterNode = WorldPcfFilter;
  registerCoarseShadowCamera(light.shadow.camera);

  scene.add(light);
  scene.add(light.target);

  const node = shadow(light);
  // three's lighting reuses this node instead of building a second one, which would overwrite
  // `shadow.map` with a target nothing bakes.
  (light.shadow as { shadowNode?: unknown }).shadowNode = node;
  S.light = light;
  S.node = node;
  S.needsRefresh = true;
  syncResolveBias(light);
  initWorldShadowVisibility(scene, node, light, WorldPcfFilter as never);
  return light;
}

export function getWorldCascadeShadowLight(): DirectionalLight | null {
  return S.light;
}

export function setWorldShadowView(view: WorldShadowView): void {
  S.view = view;
  const u = worldCascadeHandoffUniforms;
  u.uFarHalfExtentM.value =
    view === 'everywhere' ? 0.001 : view === 'off' ? 1e7 : SUN_SHADOW_FAR_FOLLOW_HALF_M;
  u.uWorldDistantWeight.value = view === 'everywhere' || view === 'off' ? 0 : 1;
  setWorldVisibilityTerms(view === 'castOnly' ? 1 : view === 'facetOnly' ? 2 : 0);
  S.needsRefresh = true;
  resetWorldVisibility('now');
}

export function getWorldShadowView(): WorldShadowView {
  return S.view;
}

export function invalidateWorldCascadeShadowMap(): void {
  S.needsRefresh = true;
}

export function getWorldCascadeTune(): Readonly<WorldCascadeTune> {
  return _tune;
}

/** DEV: apply tune fields live; every change re-bakes (a new map size re-allocates on that bake). */
export function setWorldCascadeTune(partial: Partial<WorldCascadeTune>): void {
  _tune = { ..._tune, ...partial };
  _tune.mapSize = normalizeShadowMapSize(_tune.mapSize);
  applyTuneUniforms();
  const light = S.light;
  if (!light) return;
  syncResolveBias(light);
  if (light.shadow.mapSize.x !== _tune.mapSize)
    light.shadow.mapSize.set(_tune.mapSize, _tune.mapSize);
  S.needsRefresh = true;
}

export function resetWorldCascadeTune(): void {
  setWorldCascadeTune(getWorldCascadeDefaults());
}

/** DEV: hold the current bake (compare static vs updating far shadows). */
export function setWorldCascadeFrozen(value: boolean): void {
  S.frozen = value;
  if (!value) S.needsRefresh = true;
}

export function isWorldCascadeFrozen(): boolean {
  return S.frozen;
}

/** Total bakes since load; the DEV panel derives bakes/sec from deltas. */
export function getWorldCascadeBakeCount(): number {
  return S.bakeCount;
}

/**
 * Half extent of the fixed ortho square: the map's bounding-sphere radius, so texel size never
 * changes between bakes (a per-bake AABB refit made the grid breathe and shadows swim).
 */
function worldShadowHalfExtentM(marginM: number): number {
  const h = WORLD.SIZE * 0.5;
  return Math.hypot(h, h, WORLD.HEIGHT_SCALE * 0.5) + marginM;
}

/** Metres per world-map texel at `mapSize` (DEV panel readout). */
export function worldShadowTexelM(mapSize: number, marginM: number): number {
  return (worldShadowHalfExtentM(marginM) * 2) / mapSize;
}

function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}

/** Pose at the map centre along the sun with a constant ortho square, shifted by a sub-texel Halton jitter. */
function poseAndFit(light: DirectionalLight, sunDir: Vector3): void {
  light.target.position.set(0, WORLD.HEIGHT_SCALE * 0.5, 0);
  light.target.updateMatrixWorld();
  light.position.copy(light.target.position).addScaledVector(sunDir, LIGHT_DISTANCE_M);
  light.updateMatrixWorld();

  const half = worldShadowHalfExtentM(_tune.marginM);
  const cam = light.shadow.camera;
  // Jitter lets the resolve's average of bakes converge on sub-texel casters instead of snapping to one grid.
  const texel = (half * 2) / Math.max(1, _tune.mapSize);
  S.jitterIndex = (S.jitterIndex % 64) + 1;
  const jx = (halton(S.jitterIndex, 2) - 0.5) * _tune.jitterTexels * texel;
  const jy = (halton(S.jitterIndex, 3) - 0.5) * _tune.jitterTexels * texel;
  cam.left = -half + jx;
  cam.right = half + jx;
  cam.bottom = -half + jy;
  cam.top = half + jy;
  cam.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
}

function requestBake(
  light: DirectionalLight,
  sunDir: Vector3,
  playerX: number,
  playerZ: number,
): void {
  poseAndFit(light, sunDir);
  light.shadow.needsUpdate = true;
  _bakedSunDir.copy(sunDir);
  _bakedFocus.set(playerX, 0, playerZ);
}

/**
 * Per frame: follow the far map's handoff basis, then re-bake when the sun turned by
 * `refreshAngleDeg`, the player moved `refreshMoveM` (prop LOD bins), a refresh was forced, or the
 * jittered average of a still sun has not converged yet.
 */
export function updateWorldCascadeShadow(
  sun: DirectionalLight,
  playerX: number,
  playerZ: number,
  elevationDeg = currentSunElevationDeg(),
): void {
  const light = S.light;
  if (!light) return;
  syncResolveBias(light);
  syncWorldHandoffBasis(sun);

  if (!light.castShadow || sun.intensity <= 0) {
    S.needsRefresh = true;
    return;
  }
  if (S.frozen) return;

  sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
  const angleDeg =
    (Math.acos(Math.min(1, Math.max(-1, _sunDir.dot(_bakedSunDir)))) * 180) / Math.PI;
  const moved = Math.hypot(playerX - _bakedFocus.x, playerZ - _bakedFocus.z);
  const dirty = S.needsRefresh || angleDeg >= _tune.refreshAngleDeg || moved >= _tune.refreshMoveM;
  const refining =
    !dirty && _tune.jitterTexels > 0 && S.idleBakes < Math.max(1, _tune.accumulateBakes);
  if (!dirty && !refining) return;
  const now = performance.now();
  if (!S.needsRefresh && now - S.lastBakeMs < _tune.refreshMinIntervalMs) return;
  S.lastBakeMs = now;
  S.idleBakes = dirty ? 0 : S.idleBakes + 1;

  // Forced refreshes (night, unfreeze, tune/view change) and sun jumps must not blend into stale history.
  if (S.needsRefresh || angleDeg > SUN_JUMP_RESET_DEG) resetWorldVisibility('next-bake');
  requestBake(light, _sunDir, playerX, playerZ);
  S.bakeCount++;
  S.needsRefresh = false;
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
  const light = S.light;
  if (!light?.castShadow || !renderer.shadowMap.enabled) return;
  sunDirectionFromSpherical(currentSunElevationDeg(), currentSunAzimuthDeg(), _sunDir);
  requestBake(light, _sunDir, playerX, playerZ);
  S.needsRefresh = sun.intensity <= 0;
  renderer.render(scene, camera);
}

/**
 * Per tick, before {@link updateWorldCascadeShadow}: fold the bake finished during the previous
 * frame's render into the world-XZ visibility texture receivers sample.
 */
export function resolveWorldCascadeVisibility(renderer: WebGPURenderer): void {
  const light = S.light;
  if (!light?.castShadow) return;
  resolveWorldVisibility(
    renderer,
    S.bakeCount,
    light.shadow.needsUpdate,
    _bakedSunDir,
    1 / Math.max(1, _tune.accumulateBakes),
  );
}

export function disposeWorldCascadeShadow(): void {
  disposeWorldShadowVisibility();
  const { light, node } = S;
  S = freshState();
  _tune = getWorldCascadeDefaults();
  applyTuneUniforms();
  worldCascadeHandoffUniforms.uFarHalfExtentM.value = SUN_SHADOW_FAR_FOLLOW_HALF_M;
  worldCascadeHandoffUniforms.uWorldDistantWeight.value = 1;
  setWorldVisibilityTerms(0);
  if (!light) return;
  light.parent?.remove(light);
  light.target.parent?.remove(light.target);
  // The node owns the real bake target (`light.shadow.map` may point at a stray one).
  (node as unknown as { dispose(): void } | null)?.dispose();
  light.dispose();
}
