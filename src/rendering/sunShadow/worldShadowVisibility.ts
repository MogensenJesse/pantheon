// src/rendering/sunShadow/worldShadowVisibility.ts — world-XZ sun visibility resolved from the world cascade
//
// The world cascade re-rasterises the whole map on a light-view grid that rotates with the sun,
// so sub-texel casters (edge-on needle cards, grazing terrain facets) land on different texel
// centres every bake and pop in and out. Receivers therefore never sample that map directly:
// each frame a quad pass samples it at the terrain surface of every cell of a fixed world-XZ
// grid and blends each bake into a persistent visibility texture (1/N per bake, jittered bakes).
// A cell that flips on one bake fades instead of popping; the grid itself never moves.
//
// three's ShadowNode bakes with `frame.scene`, so the bake must stay inside the main scene
// render: an invisible anchor mesh keeps the world shadow node in that render. The resolve quad
// does NOT use that node (its cached sampling graph ignores a per-material position here); it
// compares against the baked depth texture directly with three's coordinate convention. It runs
// at the start of the next tick, before the cascade is re-posed, so it always samples a finished
// bake with that bake's matrices (one frame behind — invisible at > 200 m).
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
  Vector2,
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

const _placeholderHeight = new DataTexture(new Float32Array([0]), 1, 1, RedFormat, FloatType);
_placeholderHeight.needsUpdate = true;

/** Height sampled for every visibility cell (bound by WorldBuilder after the terrain build). */
const heightUniforms = {
  uHeightTex: texture(_placeholderHeight),
  uHeightScale: uniform(WORLD.HEIGHT_SCALE),
  uWorldSize: uniform(WORLD.SIZE),
  uFacetStepM: uniform(terrainFacetStepM()),
  uHeightNormalStep: uniform(WORLD.SIZE / Math.max(1, WORLD.SEGMENTS)),
  uChiselEdgeSoft: uniform(0),
};

/** Cells below this sit under water: resolve at the surface water receivers actually shade. */
const uWaterLevelM = uniform(-1e6);

/** Receiver offset along the macro terrain normal (m) — replaces the light's normalBias. */
export const uWorldVisibilityNormalBias = uniform(VISUAL.shadows.lighting.world.normalBias);
/**
 * Receiver push toward the sun, in light NDC. Facet self-shadow is decided exactly from the
 * facet normal, so the depth test only needs real cast shadows: occluders closer than the push
 * along the ray (the facet's own neighbours, grazing slivers) cannot flip a cell.
 */
export const uWorldVisibilityPushNdc = uniform(0);
/**
 * Push for the distant-caster channel (G): the near/far maps' light sits `lightDistance` toward
 * the sun, so casters farther along the ray are clipped out of them. G only counts those.
 */
export const uWorldVisibilityDistantPushNdc = uniform(0);
/**
 * DEV view: 0 cast × facet (normal), 1 cast shadows only, 2 facet self-shadow only,
 * 3 mapping marker (ring 30–40 m around the player + cross at the world origin, no shadows).
 */
export const uWorldVisibilityTerms = uniform(0);
/** Player XZ for the mapping marker view. */
const uDebugPlayerXZ = uniform(new Vector2());

/** DEV: feed the player position used by the marker view. */
export function setWorldVisibilityDebugPlayer(x: number, z: number): void {
  (uDebugPlayerXZ.value as Vector2).set(x, z);
}
/** Direction toward the sun of the bake being resolved (facet self-shadow test). */
const uResolveSunDir = uniform(new Vector3(0, 1, 0));

/** Receivers sample this (world XZ → [0,1]² edge-to-edge, red = sun visibility). */
let visibilityTarget: RenderTarget | null = null;
let visibilityTextureNode: TslNode | null = null;
let quad: QuadMesh | null = null;
let quadMaterial: NodeMaterial | null = null;
let anchor: Mesh | null = null;
let worldLight: DirectionalLight | null = null;
let compareFilter: ShadowFilterFn | null = null;
/** The bake's own shadow node — its render target is what the anchor actually renders into. */
let bakeNode: { shadowMap?: RenderTarget | null } | null = null;
/** Depth texture the resolve quad was built against (rebuilt if the node swaps targets). */
let quadDepthTexture: DepthTexture | null = null;
let heightBound = false;
let lastSeenBake = -1;
let forceFull = true;
/** Overwrite history with the next new bake (forced re-bakes / caster changes show at once). */
let fullOnNextBake = false;
let lastRenderer: WebGPURenderer | null = null;

function ensureTarget(): RenderTarget {
  if (visibilityTarget) return visibilityTarget;
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
  visibilityTarget = rt;
  return rt;
}

/**
 * Bind the sculpt height grid (and water level) used to place each visibility cell on the
 * surface receivers shade there.
 */
export function bindWorldShadowVisibilityHeight(heightMap: DataTexture, waterLevelM: number): void {
  heightUniforms.uHeightTex.value = heightMap;
  uWaterLevelM.value = waterLevelM;
  heightUniforms.uFacetStepM.value = terrainFacetStepM();
  heightBound = true;
  forceFull = true;
}

/**
 * Receiver-side visibility at `positionWorld` (1 = sunlit). One texture + one filtering
 * sampler, same budget as sampling the world depth map directly.
 * `.x` = full world visibility (past the far map), `.y` = distant casters only (inside it).
 */
export function sampleWorldShadowVisibility(positionWorld: TslNode): TslNode {
  if (!visibilityTextureNode) visibilityTextureNode = texture(ensureTarget().texture);
  const mapUv = vec2(positionWorld.x, positionWorld.z).div(WORLD.SIZE).add(0.5);
  return visibilityTextureNode.sample(mapUv).rg;
}

/**
 * Create the bake anchor. `worldShadowNode` is the singleton `shadow(worldLight)`; `filter` is
 * the world cascade's compare filter (reused by the resolve so softness tuning still applies).
 */
export function initWorldShadowVisibility(
  scene: Scene,
  worldShadowNode: TslNode,
  light: DirectionalLight,
  filter: ShadowFilterFn,
): void {
  if (anchor) return;
  ensureTarget();
  worldLight = light;
  compareFilter = filter;
  bakeNode = worldShadowNode as { shadowMap?: RenderTarget | null };

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
  anchor = new Mesh(geo, anchorMaterial);
  anchor.name = 'worldShadowBakeAnchor';
  anchor.frustumCulled = false;
  anchor.castShadow = false;
  anchor.receiveShadow = false;
  scene.add(anchor);
}

/** Build the resolve quad once the anchor's first bake has allocated the depth texture. */
function ensureQuad(): boolean {
  // Read the bake node's own target, never `light.shadow.map`: any other ShadowNode three makes
  // for this light (lit materials, a shadow-type reset) overwrites that property with a map the
  // anchor never bakes — the resolve then compares against stale depth (phantom shadows).
  const depthTexture = (bakeNode?.shadowMap?.depthTexture ?? null) as DepthTexture | null;
  if (quad && depthTexture === quadDepthTexture) return true;
  if (quad) {
    quadMaterial?.dispose();
    quadMaterial = null;
    quad = null;
  }
  const light = worldLight;
  const filter = compareFilter;
  if (!light || !filter || !depthTexture) return false;
  quadDepthTexture = depthTexture;

  const { chiseledWorldYAtWorldXZ, macroNormalAtWorldXZ, knifeWorldNormalAtWorldXZ } =
    createMacroHeightTsl(heightUniforms);
  const worldXZ = uv().sub(0.5).mul(WORLD.SIZE);
  const terrainY = chiseledWorldYAtWorldXZ(worldXZ);
  const underwater = terrainY.lessThan(uWaterLevelM);
  const surface = vec3(worldXZ.x, max(terrainY, uWaterLevelM), worldXZ.y);
  const normal = underwater.select(vec3(0, 1, 0), macroNormalAtWorldXZ(worldXZ));
  const receiver = surface.add(normal.mul(uWorldVisibilityNormalBias));

  // Same convention as three's ShadowNode: shadow.matrix → [0,1] xy, flip y, add NDC bias.
  const clip = lightShadowMatrix(light).mul(vec4(receiver, 1));
  const ndc = clip.xyz.div(clip.w);
  const shadowCoord = vec3(ndc.x, ndc.y.oneMinus(), ndc.z.sub(uWorldVisibilityPushNdc));
  const inFrustum = shadowCoord.x
    .greaterThanEqual(0)
    .and(shadowCoord.x.lessThanEqual(1))
    .and(shadowCoord.y.greaterThanEqual(0))
    .and(shadowCoord.y.lessThanEqual(1))
    .and(shadowCoord.z.lessThanEqual(1));
  const lit = float(filter({ depthTexture, shadowCoord, shadow: light.shadow, depthLayer: null }));
  const distantCoord = vec3(
    shadowCoord.x,
    shadowCoord.y,
    ndc.z.sub(uWorldVisibilityDistantPushNdc),
  );
  const distantLit = float(
    filter({ depthTexture, shadowCoord: distantCoord, shadow: light.shadow, depthLayer: null }),
  );
  const distant = inFrustum.select(distantLit, float(1));
  // A facet facing away from the sun is in its own shadow (as the near maps resolve it) —
  // exact per 8 m facet instead of whatever the coarse map rasterised for that sliver.
  const facing = knifeWorldNormalAtWorldXZ(worldXZ).dot(uResolveSunDir);
  const selfLit = underwater.select(float(1), step(float(0), facing));
  const cast = inFrustum.select(lit, float(1));
  const toPlayer = worldXZ.sub(uDebugPlayerXZ).length();
  const ring = step(float(30), toPlayer).mul(step(toPlayer, float(40)));
  const cross = step(worldXZ.x.abs(), float(4))
    .add(step(worldXZ.y.abs(), float(4)))
    .min(1)
    .mul(step(worldXZ.length(), float(150)));
  const marker = float(1).sub(ring.add(cross).min(1));
  const vis = uWorldVisibilityTerms
    .equal(1)
    .select(
      cast,
      uWorldVisibilityTerms
        .equal(2)
        .select(selfLit, uWorldVisibilityTerms.equal(3).select(marker, cast.mul(selfLit))),
    );

  const material = new NodeMaterial();
  material.name = 'worldShadowVisibilityResolve';
  material.fragmentNode = vec4(vis, distant, float(0), float(1));
  // out = vis·b + history·(1−b) with b as the blend constant: the target is single-channel, so
  // factors that read fragment alpha (NormalBlending) fail pipeline validation.
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
  quadMaterial = material;
  quad = new QuadMesh(material);
  quad.name = 'World shadow visibility';
  forceFull = true;
  return true;
}

/** The next resolve overwrites history, even without a new bake (DEV view switches). */
export function forceWorldShadowVisibilityResolve(): void {
  forceFull = true;
}

/** The next new bake overwrites history instead of fading in (forced re-bake, caster changes). */
export function invalidateWorldShadowVisibility(): void {
  fullOnNextBake = true;
}

/**
 * Per tick, before the world cascade is re-posed: blend the last finished bake into the
 * visibility texture. Skips once history has converged and no new bake arrived.
 */
export function resolveWorldShadowVisibility(
  renderer: WebGPURenderer,
  bakeCount: number,
  bakePending: boolean,
  bakedSunDir: Vector3,
  bakeWeight: number,
): void {
  if (!visibilityTarget || !heightBound) return;
  lastRenderer = renderer;
  // The pending bake has not run yet; resolving now would only re-blend the previous one.
  if (bakePending || !ensureQuad() || !quad) return;
  const newBake = bakeCount !== lastSeenBake;
  const markerView = Number(uWorldVisibilityTerms.value) === 3;
  // One blend per bake (equal weights → jittered bakes average); nothing between bakes.
  if (!newBake && !forceFull && !markerView) return;
  lastSeenBake = bakeCount;
  if (newBake && fullOnNextBake) {
    forceFull = true;
    fullOnNextBake = false;
  }

  const blend = forceFull || markerView ? 1 : Math.min(1, Math.max(0, bakeWeight));
  quadMaterial?.blendColor.setScalar(blend);
  (uResolveSunDir.value as Vector3).copy(bakedSunDir);
  forceFull = false;

  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(visibilityTarget);
  quad.render(renderer);
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAutoClear;
}

/** DEV: read the resolved visibility at a world XZ (`full` past the far map, `distant` inside). */
export async function readWorldVisibilityAt(
  x: number,
  z: number,
): Promise<{ full: number; distant: number } | null> {
  const rt = visibilityTarget;
  if (!rt || !lastRenderer) return null;
  const ix = Math.min(rt.width - 1, Math.max(0, Math.floor((x / WORLD.SIZE + 0.5) * rt.width)));
  const iy = Math.min(rt.height - 1, Math.max(0, Math.floor((z / WORLD.SIZE + 0.5) * rt.height)));
  const data = (await lastRenderer.readRenderTargetPixelsAsync(rt, ix, iy, 1, 1)) as Uint16Array;
  const half = (h: number) => {
    const e = (h >> 10) & 0x1f;
    return e === 0 ? 0 : 2 ** (e - 15) * (1 + (h & 0x3ff) / 1024);
  };
  return { full: half(data[0] ?? 0), distant: half(data[1] ?? 0) };
}

export function disposeWorldShadowVisibility(): void {
  anchor?.removeFromParent();
  anchor?.geometry.dispose();
  (anchor?.material as NodeMaterial | undefined)?.dispose();
  anchor = null;
  quadMaterial?.dispose();
  quadMaterial = null;
  quad = null;
  visibilityTarget?.dispose();
  visibilityTarget = null;
  visibilityTextureNode = null;
  worldLight = null;
  compareFilter = null;
  bakeNode = null;
  quadDepthTexture = null;
  heightBound = false;
  lastSeenBake = -1;
  forceFull = true;
  fullOnNextBake = false;
}
