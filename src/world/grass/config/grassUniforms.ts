// src/world/grass/config/grassUniforms.ts — shared CPU/GPU grass uniforms + per-ring bundles
import { type Camera, Color, Frustum, type Matrix4, Vector2, Vector3, Vector4 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import type { GrassDevSettings } from '../../../core/settings';
import { windUniforms } from '../../../rendering/ambience/windUniforms';
import {
  foliageTintUniforms,
  grassSunReceiverUniforms,
} from '../../../rendering/sunShadow/receiverUniforms';
import { sampleTodColor } from '../../../rendering/tod/todBlend';
import { GRASS_CONFIG } from './grassConfig';
import type { GrassRingDerived } from './grassFieldMetrics';

const g = VISUAL.grass;
const WHEAT = VISUAL.village.WHEAT;
const LIFE = VISUAL.life;
const fl = g.foliageLighting;

const _frustum = new Frustum();

/** Shared across all ring fields (wind, color, biome, trail). */
export const grassSharedUniforms = {
  /** Hessian planes n·p + w (clip space matching the camera). */
  uFrustumPlane0: uniform(new Vector4()),
  uFrustumPlane1: uniform(new Vector4()),
  uFrustumPlane2: uniform(new Vector4()),
  uFrustumPlane3: uniform(new Vector4()),
  /** Perspective fy — projected-height keep only (not frustum). */
  uFy: uniform(1),
  uGrassCullDebug: uniform(0),
  uGrassLodColorDebug: uniform(0),
  /** 1 = sphere-vs-frustum test culls off-screen blades and tiles; 0 accepts everything. */
  uGrassFrustumCullEnabled: uniform(g.frustumCullEnabled ? 1 : 0),
  /** 1 = compact skips off-screen T×T tiles before terrain sample. */
  uGrassTileCullEnabled: uniform(g.tileCullEnabled ? 1 : 0),
  uPlayerPosition: uniform(new Vector3()),
  /** Player XZ used by the previous compact wrap (GPU). */
  uPrevPlayerXZ: uniform(new Vector2()),
  /** The one wind: the direction and the storm boost are set once a frame by `ambienceView`. */
  uWindDirection: windUniforms.uWindDirection,
  uWindBoost: windUniforms.uWindBoost,
  uWindClock: windUniforms.uWindClock,
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
  uWheatHeightScale: uniform(WHEAT.HEIGHT_SCALE),
  uWheatYoungScale: uniform(WHEAT.YOUNG_SCALE),
  uWheatHeightJitter: uniform(WHEAT.HEIGHT_JITTER),
  uWheatYoungColor: uniform(new Color(WHEAT.YOUNG_COLOR)),
  uWheatRipeColor: uniform(new Color(WHEAT.RIPE_COLOR)),
  uWheatTipColor: uniform(new Color(WHEAT.TIP_COLOR)),
  /** Wheat waves along the wind and lies down when wet; see `life.WHEAT_WIND`. */
  uWheatWaveGain: uniform(LIFE.WHEAT_WIND.WAVE_GAIN),
  uWheatWaveBase: uniform(LIFE.WHEAT_WIND.WAVE_BASE),
  uWheatWaveK: uniform((Math.PI * 2) / LIFE.WHEAT_WIND.WAVE_LENGTH_M),
  uWheatWaveOmega: uniform((Math.PI * 2) / LIFE.WHEAT_WIND.WAVE_PERIOD_S),
  uWheatLodge: uniform(LIFE.WHEAT_WIND.LODGE_LEAN),
  /** Plants near the orb; see `life.ORB_PLANTS`. */
  uOrbRustleRadius: uniform(LIFE.ORB_PLANTS.RUSTLE_RADIUS_M),
  uOrbRustleStrength: uniform(LIFE.ORB_PLANTS.RUSTLE_STRENGTH),
  uOrbRustleRate: uniform(LIFE.ORB_PLANTS.RUSTLE_RATE),
  uFlowerOrbRadius: uniform(LIFE.ORB_PLANTS.FLOWER_RADIUS_M),
  uFlowerOrbGlow: uniform(LIFE.ORB_PLANTS.FLOWER_GLOW_GAIN),
  uFlowerOrbSway: uniform(LIFE.ORB_PLANTS.FLOWER_SWAY_GAIN),
  uBaseColor: uniform(new Color(g.colorStops.noon.baseColor)),
  uBaseColorDark: uniform(new Color(g.colorStops.noon.baseColorDark)),
  uTipColor: uniform(new Color(g.colorStops.noon.tipColor)),
  uRustColor: uniform(new Color(g.colorStops.noon.rustColor)),
  uWarmColor: uniform(new Color(g.colorStops.noon.warmColor)),
  uShadowTint: uniform(new Color(g.colorStops.noon.shadowTint)),
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
  uDepthPullM: uniform(g.depthPullM),
  uBiomeGrassThreshold: uniform(g.biomeGrassThreshold),
  uBiomeGrassFadeWidth: uniform(g.biomeGrassFadeWidth),
  uGrassTransitionMinScale: uniform(g.transitionMinBladeScale),
  uWidthFarGain: uniform(g.widthFarGain),
  uWidthNearRadiusSquared: uniform(g.widthNearRadius * g.widthNearRadius),
  uWidthFarRadiusSquared: uniform(g.widthFarRadius * g.widthFarRadius),
  uProjectedHeightMin: uniform(g.projectedHeightMin),
  uProjectedHeightFull: uniform(g.projectedHeightFull),
  uStochasticHysteresis: uniform(g.stochasticHysteresis),
  uRingFadeHeightPower: uniform(g.ringFadeHeightPower),
  uClumpStrength: uniform(g.clumpStrength),
  uClumpEdgeMinScale: uniform(g.clumpEdgeMinScale),
  uClumpEdgeDensityBoost: uniform(g.clumpEdgeDensityBoost),
  /** Seconds accumulated since the last compact consumed it (trail + wind damping). */
  uCompactDeltaTime: uniform(0),
  /** 1 = next compact must resample height/biome (map or exclusion refresh). */
  uInvalidateTerrainCache: uniform(0),
  uTrailGrowthRate: uniform(g.trailGrowthRate),
  uTrailMinScale: uniform(g.trailMinScale),
  uPropGrassCullThreshold: uniform(g.propGrassCullThreshold),
  uPropGrassTaperBand: uniform(g.propGrassTaperBand),
  uPropGrassTaperMinScale: uniform(g.propGrassTaperMinScale),
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
  uSkyTint: foliageTintUniforms.uSkyTint,
  uGroundTint: foliageTintUniforms.uGroundTint,
  uBacklightStrength: uniform(fl.backlightStrength),
  uBacklightPunchThrough: uniform(fl.backlightPunchThrough),
  uBacklightTint: uniform(new Color(fl.backlightTint)),
  uFlowerGrassThreshold: uniform(g.flowers.grassThreshold),
  uFlowerColor1: uniform(new Color(g.flowers.color1)),
  uFlowerColor2: uniform(new Color(g.flowers.color2)),
  uFlowerColorStrength: uniform(g.flowers.colorStrength),
  uFlowerMinScale: uniform(g.flowers.minScale),
  uFlowerMaxScale: uniform(g.flowers.maxScale),
  uFlowerHeightOffset: uniform(g.flowers.heightOffset),
};

/**
 * Copy the four world-space side planes (right, left, bottom, top) into `uFrustumPlane0..3`. The extraction convention must
 * match the matrix the camera currently holds, so read both from the camera instead of
 * forcing a coordinate system (the renderer owns that switch on its first render).
 */
export function syncGrassFrustumPlanes(viewProjection: Matrix4, camera: Camera): void {
  _frustum.setFromProjectionMatrix(
    viewProjection,
    camera.coordinateSystem,
    camera.reversedDepth ?? false,
  );
  const src = _frustum.planes;
  const dst = [
    grassSharedUniforms.uFrustumPlane0,
    grassSharedUniforms.uFrustumPlane1,
    grassSharedUniforms.uFrustumPlane2,
    grassSharedUniforms.uFrustumPlane3,
  ];
  for (let i = 0; i < dst.length; i++) {
    const p = src[i]!;
    dst[i]!.value.set(p.normal.x, p.normal.y, p.normal.z, p.constant);
  }
}

type FloatUniform = ReturnType<typeof uniform<'float'>>;

/** Per-ring layout uniforms (tile wrap + annulus radii). */
export interface GrassRingUniforms {
  uInnerRadius: FloatUniform;
  uOuterRadius: FloatUniform;
  uTileSize: FloatUniform;
  uBladesPerSide: FloatUniform;
  uBladeBoundsRadius: FloatUniform;
  uFadeBandM: FloatUniform;
  uFadeInBandM: FloatUniform;
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
  ['ringFadeHeightPower', 'uRingFadeHeightPower'],
  ['clumpStrength', 'uClumpStrength'],
  ['clumpEdgeMinScale', 'uClumpEdgeMinScale'],
  ['clumpEdgeDensityBoost', 'uClumpEdgeDensityBoost'],
  ['surfaceBias', 'uSurfaceBias'],
  ['depthPullM', 'uDepthPullM'],
  ['trailGrowthRate', 'uTrailGrowthRate'],
  ['trailMinScale', 'uTrailMinScale'],
  ['trailRadius', 'uTrailRadius'],
  ['trailBendStrength', 'uTrailBendStrength'],
  ['trailKDown', 'uKDown'],
  ['playerGlowMul', 'uPlayerGlowMul'],
  ['nightColorFloor', 'uNightColorFloor'],
  ['propGrassCullThreshold', 'uPropGrassCullThreshold'],
  ['propGrassTaperBand', 'uPropGrassTaperBand'],
  ['propGrassTaperMinScale', 'uPropGrassTaperMinScale'],
] as const satisfies ReadonlyArray<readonly [GrassScalarKey, keyof typeof grassSharedUniforms]>;

export type GrassColorStopKey =
  | 'baseColor'
  | 'baseColorDark'
  | 'tipColor'
  | 'rustColor'
  | 'warmColor'
  | 'shadowTint';

const GRASS_COLOR_UNIFORM_KEYS = [
  ['baseColor', 'uBaseColor'],
  ['baseColorDark', 'uBaseColorDark'],
  ['tipColor', 'uTipColor'],
  ['rustColor', 'uRustColor'],
  ['warmColor', 'uWarmColor'],
  ['shadowTint', 'uShadowTint'],
] as const satisfies ReadonlyArray<readonly [GrassColorStopKey, keyof typeof grassSharedUniforms]>;

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
  ['backlightTint', 'uBacklightTint'],
] as const satisfies ReadonlyArray<
  readonly [keyof GrassDevSettings['foliageLighting'], keyof typeof grassSharedUniforms]
>;

const GRASS_FLOWER_SCALAR_KEYS = [
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
  u.uGrassCullDebug.value = import.meta.env.DEV && settings.cullDebug ? 1 : 0;
  u.uGrassLodColorDebug.value = import.meta.env.DEV && settings.lodColorDebug ? 1 : 0;
  u.uGrassTileCullEnabled.value = settings.tileCullEnabled ? 1 : 0;
  u.uGrassFrustumCullEnabled.value = settings.frustumCullEnabled ? 1 : 0;
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
