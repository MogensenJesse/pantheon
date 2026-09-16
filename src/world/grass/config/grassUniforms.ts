// src/world/grass/config/grassUniforms.ts — shared CPU/GPU grass uniforms + per-ring bundles
import {
  type Camera,
  Color,
  Frustum,
  Matrix4,
  Vector2,
  Vector3,
  Vector4,
  WebGPUCoordinateSystem,
} from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import type { GrassDevSettings } from '../../../core/GameState';
import { sampleTodColor } from '../../../rendering/tod/todBlend';
import { grassSunReceiverUniforms } from '../../../rendering/sunShadow/receiverUniforms';
import { GRASS_CONFIG } from './grassConfig';
import type { GrassRingDerived } from './grassFieldMetrics';

const g = VISUAL.grass;
const fl = g.foliageLighting;

const _frustum = new Frustum();



/** Shared across all ring fields (wind, color, biome, trail). */
export const grassSharedUniforms = {
  /** Hessian planes n·p + w (clip space matching the camera). */
  uFrustumPlane0: uniform(new Vector4()),
  uFrustumPlane1: uniform(new Vector4()),
  uFrustumPlane2: uniform(new Vector4()),
  uFrustumPlane3: uniform(new Vector4()),
  uFrustumPlane4: uniform(new Vector4()),
  uFrustumPlane5: uniform(new Vector4()),
  /** Perspective fy — projected-height keep only (not frustum). */
  uFy: uniform(1),
  uBladeBoundsRadius: uniform(g.bladeHeight * g.bladeMaxScale),
  uGrassCullDebug: uniform(0),
  uGrassLodColorDebug: uniform(0),
  /** 1 = compact skips off-screen T×T tiles before terrain sample. */
  uGrassTileCullEnabled: uniform(g.tileCullEnabled ? 1 : 0),
  uPlayerPosition: uniform(new Vector3()),
  uCameraPosition: uniform(new Vector3()),
  /** Player XZ used by the previous compact wrap (GPU). */
  uPrevPlayerXZ: uniform(new Vector2()),
  uWindDirection: uniform(new Vector2(0.85, 0.35).normalize()),
  uWindStrength: uniform(g.windStrength),
  uWindSpeed: uniform(g.windSpeed),
  uWindUvScale: uniform(g.windUvScale),
  uAmbientSwayStrength: uniform(g.ambientSwayStrength),
  uWindLull: uniform(g.windLull),
  uWindEddyStrength: uniform(g.windEddyStrength),
  uWindGustCoverage: uniform(g.windGustCoverage),
  uWindCurveP1: uniform(g.windCurveP1),
  uWindCurveP2: uniform(g.windCurveP2),
  uBendDropStrength: uniform(g.bendDropStrength),
  uBendControlPoint: uniform(g.bendControlPoint),
  uSpriteRotationRandomness: uniform(g.spriteRotationRandomness),
  uBladeHeight: uniform(g.bladeHeight),
  uBladeMinScale: uniform(g.bladeMinScale),
  uBladeMaxScale: uniform(g.bladeMaxScale),
  uBaseColor: uniform(new Color(g.colorStops.noon.baseColor)),
  uBaseColorDark: uniform(new Color(g.colorStops.noon.baseColorDark)),
  uTipColor: uniform(new Color(g.colorStops.noon.tipColor)),
  uRustColor: uniform(new Color(g.colorStops.noon.rustColor)),
  uWarmColor: uniform(new Color(g.colorStops.noon.warmColor)),
  uColorMixFactor: uniform(g.colorMixFactor),
  uColorVariationStrength: uniform(g.colorVariationStrength),
  uRustVariationStrength: uniform(g.rustVariationStrength),
  uWarmVariationStrength: uniform(g.warmVariationStrength),
  uAoRadius: uniform(g.aoRadius),
  uAoRimSmoothness: uniform(g.aoRimSmoothness),
  uAoScale: uniform(g.aoScale),
  uSheenStrength: uniform(g.sheenStrength),
  uTransmissionStrength: uniform(g.transmissionStrength),
  uBaseWindShade: uniform(g.baseWindShade),
  uBaseShadeHeight: uniform(g.baseShadeHeight),
  uBaseBending: uniform(g.baseBending),
  uWorldSize: uniform(0),
  uHeightScale: uniform(0),
  uSurfaceBias: uniform(g.surfaceBias),
  uBiomeGrassThreshold: uniform(g.biomeGrassThreshold),
  uBiomeGrassFadeWidth: uniform(g.biomeGrassFadeWidth),
  uGrassTransitionMinScale: uniform(g.transitionMinBladeScale),
  uWidthFarGain: uniform(g.widthFarGain),
  uWidthNearRadiusSquared: uniform(g.widthNearRadius * g.widthNearRadius),
  uWidthFarRadiusSquared: uniform(g.widthFarRadius * g.widthFarRadius),
  uProjectedHeightMin: uniform(g.projectedHeightMin),
  uProjectedHeightFull: uniform(g.projectedHeightFull),
  uStochasticHysteresis: uniform(g.stochasticHysteresis),
  uClumpStrength: uniform(g.clumpStrength),
  uClumpScaleM: uniform(g.clumpScaleM),
  uClumpCoverage: uniform(g.clumpCoverage),
  uClumpSoftness: uniform(g.clumpSoftness),
  uClumpEdgeMinScale: uniform(g.clumpEdgeMinScale),
  uClumpEdgeDensityBoost: uniform(g.clumpEdgeDensityBoost),
  uTime: uniform(0),
  /** Seconds accumulated since the last compact consumed it (trail + wind damping). */
  uCompactDeltaTime: uniform(0),
  /** 1 = next compact must resample height/biome (map or exclusion refresh). */
  uInvalidateTerrainCache: uniform(0),
  uTrailGrowthRate: uniform(g.trailGrowthRate),
  uTrailMinScale: uniform(g.trailMinScale),
  uPropGrassCullThreshold: uniform(g.propGrassCullThreshold),
  uTrailRadius: uniform(g.trailRadius),
  uTrailRadiusSquared: uniform(g.trailRadius * g.trailRadius),
  uTrailBendStrength: uniform(g.trailBendStrength),
  uKDown: uniform(g.trailKDown),
  uPlayerGlowMul: uniform(g.playerGlowMul),
  uDaylight: uniform(VISUAL.sky.lighting.night.daylightFactor),
  uNightSkyDaylight: uniform(VISUAL.sky.lighting.night.daylightFactor),
  uNightColorFloor: uniform(g.nightColorFloor),
  uShadowFloor: grassSunReceiverUniforms.uShadowFloor,
  uLightRadius: uniform(6),
  uLightIntensity: uniform(2.2),
  uSunIntensity: grassSunReceiverUniforms.uSunIntensity,
  uSunColor: grassSunReceiverUniforms.uSunColor,
  uSunDirection: grassSunReceiverUniforms.uSunDirection,
  uWrapStrength: uniform(fl.wrapStrength),
  uHemisphereStrength: uniform(fl.hemisphereStrength),
  uSkyTint: uniform(new Color(fl.skyTint)),
  uGroundTint: uniform(new Color(fl.groundTint)),
  uBacklightStrength: uniform(fl.backlightStrength),
  uBacklightPunchThrough: uniform(fl.backlightPunchThrough),
  uBacklightTint: uniform(new Color(fl.backlightTint)),
  uFlowerBoundsRadius: uniform(g.flowers.boundsRadius),
  uFlowerGrassThreshold: uniform(g.flowers.grassThreshold),
  uFlowerColor1: uniform(new Color(g.flowers.color1)),
  uFlowerColor2: uniform(new Color(g.flowers.color2)),
  uFlowerColorStrength: uniform(g.flowers.colorStrength),
  uFlowerMinScale: uniform(g.flowers.minScale),
  uFlowerMaxScale: uniform(g.flowers.maxScale),
  uFlowerHeightOffset: uniform(g.flowers.heightOffset),
};

/** Copy view-projection planes into `uFrustumPlane0..5` (clip space of this camera). */
export function syncGrassFrustumPlanes(viewProjection: Matrix4, camera: Camera): void {
  // Play is WebGPU-only. Extract with WebGPU clip conventions even if the camera
  // still reports WebGLCoordinateSystem before the first Renderer.render().
  const coordinateSystem = WebGPUCoordinateSystem;
  const reversedDepth = camera.reversedDepth ?? false;
  _frustum.setFromProjectionMatrix(viewProjection, coordinateSystem, reversedDepth);
  const src = _frustum.planes;
  const dst = [
    grassSharedUniforms.uFrustumPlane0,
    grassSharedUniforms.uFrustumPlane1,
    grassSharedUniforms.uFrustumPlane2,
    grassSharedUniforms.uFrustumPlane3,
    grassSharedUniforms.uFrustumPlane4,
    grassSharedUniforms.uFrustumPlane5,
  ];
  for (let i = 0; i < 6; i++) {
    const p = src[i]!;
    dst[i]!.value.set(p.normal.x, p.normal.y, p.normal.z, p.constant);
  }
}

/** Per-ring layout uniforms (tile wrap + annulus radii). */
export interface GrassRingUniforms {
  uInnerRadius: ReturnType<typeof uniform>;
  uOuterRadius: ReturnType<typeof uniform>;
  uTileSize: ReturnType<typeof uniform>;
  uBladesPerSide: ReturnType<typeof uniform>;
  uBladeBoundsRadius: ReturnType<typeof uniform>;
  uFadeBandM: ReturnType<typeof uniform>;
  uFadeInBandM: ReturnType<typeof uniform>;
}

export function computeGrassRingBoundsRadius(
  bladeWidth: number,
  bladeHeight = GRASS_CONFIG.BLADE_HEIGHT,
  bladeMaxScale = grassSharedUniforms.uBladeMaxScale.value,
): number {
  return Math.max(bladeHeight * bladeMaxScale, bladeWidth);
}

export function createGrassRingUniforms(ring: GrassRingDerived): GrassRingUniforms {
  const ringUniforms: GrassRingUniforms = {
    uInnerRadius: uniform(ring.innerRadius),
    uOuterRadius: uniform(ring.outerRadius),
    uTileSize: uniform(ring.tileSize),
    uBladesPerSide: uniform(ring.bladesPerSide),
    uBladeBoundsRadius: uniform(computeGrassRingBoundsRadius(ring.bladeWidth)),
    uFadeBandM: uniform(ring.fadeBandM),
    uFadeInBandM: uniform(ring.fadeInBandM),
  };
  applyGrassRingUniforms(ringUniforms, ring);
  return ringUniforms;
}

type GrassScalarKey = {
  [K in keyof GrassDevSettings]: GrassDevSettings[K] extends number ? K : never;
}[keyof GrassDevSettings];

const GRASS_SCALAR_UNIFORM_KEYS = [
  ['windStrength', 'uWindStrength'],
  ['windSpeed', 'uWindSpeed'],
  ['windUvScale', 'uWindUvScale'],
  ['ambientSwayStrength', 'uAmbientSwayStrength'],
  ['windLull', 'uWindLull'],
  ['windEddyStrength', 'uWindEddyStrength'],
  ['windGustCoverage', 'uWindGustCoverage'],
  ['windCurveP1', 'uWindCurveP1'],
  ['windCurveP2', 'uWindCurveP2'],
  ['bendDropStrength', 'uBendDropStrength'],
  ['bendControlPoint', 'uBendControlPoint'],
  ['spriteRotationRandomness', 'uSpriteRotationRandomness'],
  ['bladeHeight', 'uBladeHeight'],
  ['bladeMinScale', 'uBladeMinScale'],
  ['bladeMaxScale', 'uBladeMaxScale'],
  ['colorMixFactor', 'uColorMixFactor'],
  ['colorVariationStrength', 'uColorVariationStrength'],
  ['rustVariationStrength', 'uRustVariationStrength'],
  ['warmVariationStrength', 'uWarmVariationStrength'],
  ['aoRadius', 'uAoRadius'],
  ['aoRimSmoothness', 'uAoRimSmoothness'],
  ['aoScale', 'uAoScale'],
  ['sheenStrength', 'uSheenStrength'],
  ['transmissionStrength', 'uTransmissionStrength'],
  ['baseWindShade', 'uBaseWindShade'],
  ['baseShadeHeight', 'uBaseShadeHeight'],
  ['baseBending', 'uBaseBending'],
  ['biomeGrassThreshold', 'uBiomeGrassThreshold'],
  ['biomeGrassFadeWidth', 'uBiomeGrassFadeWidth'],
  ['transitionMinBladeScale', 'uGrassTransitionMinScale'],
  ['widthFarGain', 'uWidthFarGain'],
  ['projectedHeightMin', 'uProjectedHeightMin'],
  ['projectedHeightFull', 'uProjectedHeightFull'],
  ['stochasticHysteresis', 'uStochasticHysteresis'],
  ['clumpStrength', 'uClumpStrength'],
  ['clumpScaleM', 'uClumpScaleM'],
  ['clumpCoverage', 'uClumpCoverage'],
  ['clumpSoftness', 'uClumpSoftness'],
  ['clumpEdgeMinScale', 'uClumpEdgeMinScale'],
  ['clumpEdgeDensityBoost', 'uClumpEdgeDensityBoost'],
  ['surfaceBias', 'uSurfaceBias'],
  ['trailGrowthRate', 'uTrailGrowthRate'],
  ['trailMinScale', 'uTrailMinScale'],
  ['trailRadius', 'uTrailRadius'],
  ['trailBendStrength', 'uTrailBendStrength'],
  ['trailKDown', 'uKDown'],
  ['playerGlowMul', 'uPlayerGlowMul'],
  ['nightColorFloor', 'uNightColorFloor'],
  ['propGrassCullThreshold', 'uPropGrassCullThreshold'],
] as const satisfies ReadonlyArray<readonly [GrassScalarKey, keyof typeof grassSharedUniforms]>;

export type GrassColorStopKey =
  | 'baseColor'
  | 'baseColorDark'
  | 'tipColor'
  | 'rustColor'
  | 'warmColor';

const GRASS_COLOR_UNIFORM_KEYS = [
  ['baseColor', 'uBaseColor'],
  ['baseColorDark', 'uBaseColorDark'],
  ['tipColor', 'uTipColor'],
  ['rustColor', 'uRustColor'],
  ['warmColor', 'uWarmColor'],
] as const satisfies ReadonlyArray<
  readonly [GrassColorStopKey, keyof typeof grassSharedUniforms]
>;

const _grassTodColor = new Color();

/** Push blended blade albedo from ToD colorStops into shared uniforms. */
export function syncGrassTodColors(
  elevationDeg: number,
  stops: GrassDevSettings['colorStops'],
): void {
  const u = grassSharedUniforms;
  for (const [key, uniformKey] of GRASS_COLOR_UNIFORM_KEYS) {
    sampleTodColor(
      {
        night: stops.night[key],
        goldenHour: stops.goldenHour[key],
        noon: stops.noon[key],
      },
      elevationDeg,
      _grassTodColor,
    );
    (u[uniformKey] as { value: Color }).value.copy(_grassTodColor);
  }
}

const GRASS_FOLIAGE_SCALAR_KEYS = [
  ['wrapStrength', 'uWrapStrength'],
  ['hemisphereStrength', 'uHemisphereStrength'],
  ['backlightStrength', 'uBacklightStrength'],
  ['backlightPunchThrough', 'uBacklightPunchThrough'],
] as const satisfies ReadonlyArray<
  readonly [keyof GrassDevSettings['foliageLighting'], keyof typeof grassSharedUniforms]
>;

const GRASS_FOLIAGE_COLOR_KEYS = [
  ['skyTint', 'uSkyTint'],
  ['groundTint', 'uGroundTint'],
  ['backlightTint', 'uBacklightTint'],
] as const satisfies ReadonlyArray<
  readonly [keyof GrassDevSettings['foliageLighting'], keyof typeof grassSharedUniforms]
>;

const GRASS_FLOWER_SCALAR_KEYS = [
  ['boundsRadius', 'uFlowerBoundsRadius'],
  ['grassThreshold', 'uFlowerGrassThreshold'],
  ['colorStrength', 'uFlowerColorStrength'],
  ['minScale', 'uFlowerMinScale'],
  ['maxScale', 'uFlowerMaxScale'],
  ['heightOffset', 'uFlowerHeightOffset'],
] as const satisfies ReadonlyArray<
  readonly [keyof GrassDevSettings['flowers'], keyof typeof grassSharedUniforms]
>;

const GRASS_FLOWER_COLOR_KEYS = [
  ['color1', 'uFlowerColor1'],
  ['color2', 'uFlowerColor2'],
] as const satisfies ReadonlyArray<
  readonly [keyof GrassDevSettings['flowers'], keyof typeof grassSharedUniforms]
>;

export function applyGrassSharedDevUniforms(settings: GrassDevSettings): void {
  const u = grassSharedUniforms;
  for (const [key, uniformKey] of GRASS_SCALAR_UNIFORM_KEYS) {
    (u[uniformKey] as { value: number }).value = settings[key];
  }
  // Blade albedo comes from syncGrassTodColors (todWeights) — not flat settings.
  const fl = settings.foliageLighting;
  for (const [key, uniformKey] of GRASS_FOLIAGE_SCALAR_KEYS) {
    (u[uniformKey] as { value: number }).value = fl[key];
  }
  for (const [key, uniformKey] of GRASS_FOLIAGE_COLOR_KEYS) {
    (u[uniformKey] as { value: { set: (hex: string) => void } }).value.set(fl[key]);
  }
  const f = settings.flowers;
  for (const [key, uniformKey] of GRASS_FLOWER_SCALAR_KEYS) {
    (u[uniformKey] as { value: number }).value = f[key];
  }
  for (const [key, uniformKey] of GRASS_FLOWER_COLOR_KEYS) {
    (u[uniformKey] as { value: { set: (hex: string) => void } }).value.set(f[key]);
  }
  u.uBladeBoundsRadius.value = settings.bladeHeight * settings.bladeMaxScale;
  u.uGrassCullDebug.value = import.meta.env.DEV && settings.cullDebug ? 1 : 0;
  u.uGrassLodColorDebug.value = import.meta.env.DEV && settings.lodColorDebug ? 1 : 0;
  u.uGrassTileCullEnabled.value = settings.tileCullEnabled ? 1 : 0;
  const widthNear = Math.max(0, settings.widthNearRadius);
  const widthFar = Math.max(widthNear + 0.01, settings.widthFarRadius);
  u.uWidthNearRadiusSquared.value = widthNear * widthNear;
  u.uWidthFarRadiusSquared.value = widthFar * widthFar;
  u.uTrailRadiusSquared.value = settings.trailRadius * settings.trailRadius;
}

export function applyGrassRingUniforms(
  ringUniforms: GrassRingUniforms,
  ring: GrassRingDerived,
  bladeHeight = GRASS_CONFIG.BLADE_HEIGHT,
  bladeMaxScale = grassSharedUniforms.uBladeMaxScale.value,
): void {
  ringUniforms.uInnerRadius.value = ring.innerRadius;
  ringUniforms.uOuterRadius.value = ring.outerRadius;
  ringUniforms.uTileSize.value = ring.tileSize;
  ringUniforms.uBladesPerSide.value = ring.bladesPerSide;
  ringUniforms.uFadeBandM.value = ring.fadeBandM;
  ringUniforms.uFadeInBandM.value = ring.fadeInBandM;
  ringUniforms.uBladeBoundsRadius.value = computeGrassRingBoundsRadius(
    ring.bladeWidth,
    bladeHeight,
    bladeMaxScale,
  );
}
