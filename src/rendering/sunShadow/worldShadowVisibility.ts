// src/rendering/sunShadow/worldShadowVisibility.ts — world-XZ sun visibility resolved from the world cascade
//
// WHY: the world map is re-rasterised on a light-view grid that rotates with the sun, so casters
// thinner than a texel (edge-on needle cards, grazing facets) hit different texels every bake and
// pop. Receivers never sample that map. Each bake is resolved at the terrain surface of a fixed
// world-XZ grid and blended 1/N (jittered bakes) into a persistent RG texture:
//   R = full visibility (past the far map), G = casters the near/far maps clip (inside it).
//
// three's ShadowNode bakes with the scene being rendered, so an invisible anchor mesh keeps the
// bake in the main render. The resolve quad compares against that node's depth texture directly
// (the node's own sampling graph ignores a per-material position) and runs at the start of the next
// tick, before the cascade is re-posed, so it always sees a finished bake with its own matrices.
import {
  AddEquation,
  BufferGeometry,
  ConstantColorFactor,
  CustomBlending,
  DataTexture,
  type DepthTexture,
  type DirectionalLight,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OneFactor,
  OneMinusConstantColorFactor,
  RedFormat,
  RGFormat,
  type Scene,
  Vector3,
  ZeroFactor,
} from 'three';
import {
  float,
  lightShadowMatrix,
  max,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  MeshBasicNodeMaterial,
  NodeMaterial,
  QuadMesh,
  RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import { terrainFacetStepM } from '../../world/terrain/cpu/terrainChiselCpu';
import { createMacroHeightTsl } from '../../world/terrain/tsl/terrainMacroHeightTsl';

type TslNode = any;
/** Compare-filter Fn shaped like three's shadow filters ({ depthTexture, shadowCoord, shadow }). */
type ShadowFilterFn = (args: Record<string, unknown>) => TslNode;

/** When the next resolve overwrites history instead of blending. */
type VisibilityReset = 'next-bake' | 'now';

const _placeholderHeight = new DataTexture(new Float32Array([0]), 1, 1, RedFormat, FloatType);
_placeholderHeight.needsUpdate = true;

/** Sculpt height sampled for every cell (bound by WorldBuilder after the terrain build). */
const heightUniforms = {
  uHeightTex: texture(_placeholderHeight),
  uHeightScale: uniform(WORLD.HEIGHT_SCALE),
  uWorldSize: uniform(WORLD.SIZE),
  uFacetStepM: uniform(terrainFacetStepM()),
  uHeightNormalStep: uniform(WORLD.SIZE / Math.max(1, WORLD.SEGMENTS)),
  uChiselEdgeSoft: uniform(0),
};

/** Cells below this resolve at the water surface the water receivers actually shade. */
const uWaterLevelM = uniform(-1e6);
/** Receiver offset along the macro terrain normal (m); the quad has no surface normal of its own. */
const uNormalBiasM = uniform(VISUAL.shadows.lighting.world.normalBias);
/** Receiver push toward the sun in light NDC: skips occluders too close to be real (neighbours, slivers). */
const uPushNdc = uniform(0);
/** Push for the G channel: only casters beyond the near/far maps' light distance count. */
const uDistantPushNdc = uniform(0);
/** DEV view: 0 cast × facet (normal), 1 cast only, 2 facet only. */
const uTerms = uniform(0);
/** Direction toward the sun of the bake being resolved (facet self-shadow test). */
const uResolveSunDir = uniform(new Vector3(0, 1, 0));

interface VisibilityState {
  /** Receivers sample this (world XZ → [0,1]² edge-to-edge). */
  target: RenderTarget | null;
  textureNode: TslNode | null;
  quad: QuadMesh | null;
  quadMaterial: NodeMaterial | null;
  /** Depth texture the quad was built against (rebuilt if the node swaps targets). */
  quadDepth: DepthTexture | null;
  anchor: Mesh | null;
  light: DirectionalLight | null;
  filter: ShadowFilterFn | null;
  /** The bake's own shadow node: its render target is what the anchor actually bakes into. */
  bakeNode: { shadowMap?: RenderTarget | null } | null;
  heightBound: boolean;
  lastSeenBake: number;
  reset: 'none' | VisibilityReset;
}

const freshState = (): VisibilityState => ({
  target: null,
  textureNode: null,
  quad: null,
  quadMaterial: null,
  quadDepth: null,
  anchor: null,
  light: null,
  filter: null,
  bakeNode: null,
  heightBound: false,
  lastSeenBake: -1,
  reset: 'now',
});

let S = freshState();

function ensureTarget(): RenderTarget {
  if (S.target) return S.target;
  const res = VISUAL.shadows.lighting.world.visibilityRes;
  const rt = new RenderTarget(res, res, {
    type: HalfFloatType,
    format: RGFormat,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  rt.texture.name = 'WorldShadowVisibility';
  S.target = rt;
  return rt;
}

/** Resolve-side biases: normal offset (m) and the two sun-ward pushes (light NDC). */
export function setWorldVisibilityBias(bias: {
  normalBiasM: number;
  pushNdc: number;
  distantPushNdc: number;
}): void {
  uNormalBiasM.value = bias.normalBiasM;
  uPushNdc.value = bias.pushNdc;
  uDistantPushNdc.value = bias.distantPushNdc;
}

/** DEV: which resolve terms to output (0 both, 1 cast only, 2 facet only). */
export function setWorldVisibilityTerms(terms: 0 | 1 | 2): void {
  uTerms.value = terms;
}

/** Overwrite history on the next resolve ('now') or the next new bake ('next-bake'); 'now' wins. */
export function resetWorldVisibility(when: VisibilityReset): void {
  if (S.reset !== 'now') S.reset = when;
}

/** Bind the sculpt height grid and water level that place each cell on the surface receivers shade. */
export function bindWorldShadowVisibilityHeight(heightMap: DataTexture, waterLevelM: number): void {
  heightUniforms.uHeightTex.value = heightMap;
  uWaterLevelM.value = waterLevelM;
  heightUniforms.uFacetStepM.value = terrainFacetStepM();
  S.heightBound = true;
  S.reset = 'now';
}

/**
 * Receiver-side visibility at `positionWorld` (1 = sunlit): `.x` full world visibility (past the far
 * map), `.y` distant casters only (inside it). One texture + one filtering sampler.
 */
export function sampleWorldShadowVisibility(positionWorld: TslNode): TslNode {
  if (!S.textureNode) S.textureNode = texture(ensureTarget().texture);
  const mapUv = vec2(positionWorld.x, positionWorld.z).div(WORLD.SIZE).add(0.5);
  return S.textureNode.sample(mapUv).rg;
}

/**
 * Create the bake anchor. `worldShadowNode` is the singleton `shadow(worldLight)`; `filter` is the
 * cascade's compare filter, reused so its softness tuning applies to the resolve.
 */
export function initWorldShadowVisibility(
  scene: Scene,
  worldShadowNode: TslNode,
  light: DirectionalLight,
  filter: ShadowFilterFn,
): void {
  if (S.anchor) return;
  ensureTarget();
  S.light = light;
  S.filter = filter;
  S.bakeNode = worldShadowNode as { shadowMap?: RenderTarget | null };

  const anchorMaterial = new MeshBasicNodeMaterial();
  anchorMaterial.name = 'worldShadowBakeAnchor';
  anchorMaterial.colorNode = vec3(float(worldShadowNode.r).mul(0));
  anchorMaterial.colorWrite = false;
  anchorMaterial.depthWrite = false;
  anchorMaterial.depthTest = false;
  anchorMaterial.fog = false;
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new Float32BufferAttribute([0, -1e4, 0, 1e-3, -1e4, 0, 0, -1e4, 1e-3], 3),
  );
  const anchor = new Mesh(geo, anchorMaterial);
  anchor.name = 'worldShadowBakeAnchor';
  anchor.frustumCulled = false;
  anchor.castShadow = false;
  anchor.receiveShadow = false;
  scene.add(anchor);
  S.anchor = anchor;
}

/** Build the resolve quad once the anchor's first bake has allocated the depth texture. */
function ensureQuad(): boolean {
  // Read the bake node's own target, never `light.shadow.map`: any other ShadowNode three makes for
  // this light overwrites that property with a map the anchor never bakes (stale depth → phantoms).
  const depthTexture = (S.bakeNode?.shadowMap?.depthTexture ?? null) as DepthTexture | null;
  if (S.quad && depthTexture === S.quadDepth) return true;
  S.quadMaterial?.dispose();
  S.quadMaterial = null;
  S.quad = null;
  const { light, filter } = S;
  if (!light || !filter || !depthTexture) return false;
  S.quadDepth = depthTexture;

  const { chiseledWorldYAtWorldXZ, macroNormalAtWorldXZ, knifeWorldNormalAtWorldXZ } =
    createMacroHeightTsl(heightUniforms);
  const worldXZ = uv().sub(0.5).mul(WORLD.SIZE);
  const terrainY = chiseledWorldYAtWorldXZ(worldXZ);
  const underwater = terrainY.lessThan(uWaterLevelM);
  const surface = vec3(worldXZ.x, max(terrainY, uWaterLevelM), worldXZ.y);
  const normal = underwater.select(vec3(0, 1, 0), macroNormalAtWorldXZ(worldXZ));
  const receiver = surface.add(normal.mul(uNormalBiasM));

  // three's ShadowNode convention: shadow.matrix → [0,1] xy, flip y, NDC depth bias.
  const clip = lightShadowMatrix(light).mul(vec4(receiver, 1));
  const ndc = clip.xyz.div(clip.w);
  const shadowCoord = vec3(ndc.x, ndc.y.oneMinus(), ndc.z.sub(uPushNdc));
  const inFrustum = shadowCoord.x
    .greaterThanEqual(0)
    .and(shadowCoord.x.lessThanEqual(1))
    .and(shadowCoord.y.greaterThanEqual(0))
    .and(shadowCoord.y.lessThanEqual(1))
    .and(shadowCoord.z.lessThanEqual(1));
  const compare = (coord: TslNode) =>
    float(filter({ depthTexture, shadowCoord: coord, shadow: light.shadow, depthLayer: null }));
  const cast = inFrustum.select(compare(shadowCoord), float(1));
  const distant = inFrustum.select(
    compare(vec3(shadowCoord.x, shadowCoord.y, ndc.z.sub(uDistantPushNdc))),
    float(1),
  );
  // A facet facing away from the sun is in its own shadow, as the near maps resolve it: exact per
  // 8 m facet instead of whatever the coarse map rasterised for that sliver.
  const facing = knifeWorldNormalAtWorldXZ(worldXZ).dot(uResolveSunDir);
  const selfLit = underwater.select(float(1), step(float(0), facing));
  const vis = import.meta.env.DEV
    ? uTerms.equal(1).select(cast, uTerms.equal(2).select(selfLit, cast.mul(selfLit)))
    : cast.mul(selfLit);

  const material = new NodeMaterial();
  material.name = 'worldShadowVisibilityResolve';
  material.fragmentNode = vec4(vis, distant, float(0), float(1));
  // out = new·b + history·(1−b), b = blend constant. Alpha-reading factors (NormalBlending) fail
  // pipeline validation on a target without an alpha channel.
  material.transparent = true;
  material.blending = CustomBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = ConstantColorFactor;
  material.blendDst = OneMinusConstantColorFactor;
  material.blendEquationAlpha = AddEquation;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = ZeroFactor;
  material.blendColor.setScalar(1);
  material.depthTest = false;
  material.depthWrite = false;
  S.quadMaterial = material;
  S.quad = new QuadMesh(material);
  S.quad.name = 'World shadow visibility';
  S.reset = 'now'; // new quad = uncleared history
  return true;
}

/**
 * Per tick, before the cascade is re-posed: blend the last finished bake into the texture, with
 * weight `bakeWeight` (1/N). Does nothing between bakes.
 */
export function resolveWorldVisibility(
  renderer: WebGPURenderer,
  bakeCount: number,
  bakePending: boolean,
  bakedSunDir: Vector3,
  bakeWeight: number,
): void {
  if (!S.target || !S.heightBound) return;
  // A pending bake has not rendered yet; resolving now would only re-blend the previous one.
  if (bakePending || !ensureQuad() || !S.quad) return;
  const newBake = bakeCount !== S.lastSeenBake;
  if (!newBake && S.reset !== 'now') return;
  S.lastSeenBake = bakeCount;
  const overwrite = S.reset === 'now' || (newBake && S.reset === 'next-bake');
  if (overwrite) S.reset = 'none';

  S.quadMaterial?.blendColor.setScalar(overwrite ? 1 : Math.min(1, Math.max(0, bakeWeight)));
  (uResolveSunDir.value as Vector3).copy(bakedSunDir);

  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(S.target);
  S.quad.render(renderer);
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
}

export function disposeWorldShadowVisibility(): void {
  const { anchor, quadMaterial, target } = S;
  anchor?.removeFromParent();
  anchor?.geometry.dispose();
  (anchor?.material as NodeMaterial | undefined)?.dispose();
  quadMaterial?.dispose();
  target?.dispose();
  S = freshState();
}
