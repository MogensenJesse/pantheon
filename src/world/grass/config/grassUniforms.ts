// src/world/grass/config/grassUniforms.ts — shared CPU/GPU grass uniforms + per-ring bundles
import { Color, Matrix4, Vector2, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import type { GrassDevSettings } from '../../../core/GameState';
import { grassSunReceiverUniforms } from '../../../rendering/sunShadow/receiverUniforms';
import { GRASS_CONFIG } from './grassConfig';

const g = VISUAL.grass;
const fl = g.foliageLighting;

/** Shared across all ring fields (wind, color, biome, trail, cull pads). */
export const grassSharedUniforms = {
  uCameraMatrix: uniform(new Matrix4()),
  uFx: uniform(1),
  uFy: uniform(1),
  uBladeBoundsRadius: uniform(g.bladeHeight * g.bladeMaxScale),
  uCullPadNdcX: uniform(g.cullPadNdcX),
  uCullPadNdcYNear: uniform(g.cullPadNdcYNear),
  uCullPadNdcYFar: uniform(g.cullPadNdcYFar),
  uGrassCullDebug: uniform(0),
  uGrassLodColorDebug: uniform(0),
  /** 1 = compact skips off-screen T×T tiles before terrain sample. */
  uGrassTileCullEnabled: uniform(g.tileCullEnabled ? 1 : 0),
  uPlayerPosition: uniform(new Vector3()),
  uCameraPosition: uniform(new Vector3()),
  /** Delta consumed by the in-flight / next compact wrap (GPU). */
  uPlayerDeltaXZ: uniform(new Vector2()),
  /**
   * Player XZ moved since SSBO offsets were last wrapped — subtract in the draw shader
   * so blades stay world-locked while compact is async (kills start-move jerk).
   */
  uUncompactedDeltaXZ: uniform(new Vector2()),
  uCameraForward: uniform(new Vector3(0, 0, -1)),
  uWindDirection: uniform(new Vector2(0.85, 0.35).normalize()),
  uWindStrength: uniform(g.windStrength),
  uWindSpeed: uniform(g.windSpeed),
  uWindUvScale: uniform(g.windUvScale),
  uAmbientSwayStrength: uniform(g.ambientSwayStrength),
  uWindLull: uniform(g.windLull),
  uWindEddyStrength: uniform(g.windEddyStrength),
  uWindGustCoverage: uniform(g.windGustCoverage),
  uDetailedWindRadius: uniform(g.detailedWindRadius),
  uWindCurveP1: uniform(g.windCurveP1),
  uWindCurveP2: uniform(g.windCurveP2),
  uBendDropStrength: uniform(g.bendDropStrength),
  uBendControlPoint: uniform(g.bendControlPoint),
  uSpriteRotationRandomness: uniform(g.spriteRotationRandomness),
  uBladeHeight: uniform(g.bladeHeight),
  uBladeMinScale: uniform(g.bladeMinScale),
  uBladeMaxScale: uniform(g.bladeMaxScale),
  uBaseColor: uniform(new Color(g.baseColor)),
  uBaseColorDark: uniform(new Color(g.baseColorDark)),
  uTipColor: uniform(new Color(g.tipColor)),
  uRustColor: uniform(new Color(g.rustColor)),
  uWarmColor: uniform(new Color(g.warmColor)),
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
  uDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
  uNightSkyDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
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

/** Per-ring layout uniforms (tile wrap + annulus radii + frustum pad). */
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

export function createGrassRingUniforms(ring: {
  innerRadius: number;
  outerRadius: number;
  tileSize: number;
  bladesPerSide: number;
  bladeWidth: number;
  fadeBandM?: number;
  fadeInBandM?: number;
}): GrassRingUniforms {
  return {
    uInnerRadius: uniform(ring.innerRadius),
    uOuterRadius: uniform(ring.outerRadius),
    uTileSize: uniform(ring.tileSize),
    uBladesPerSide: uniform(ring.bladesPerSide),
    uBladeBoundsRadius: uniform(computeGrassRingBoundsRadius(ring.bladeWidth)),
    uFadeBandM: uniform(ring.fadeBandM ?? 0),
    uFadeInBandM: uniform(ring.fadeInBandM ?? 0),
  };
}

export function applyGrassSharedDevUniforms(settings: GrassDevSettings): void {
  const u = grassSharedUniforms;
  u.uBladeBoundsRadius.value = settings.bladeHeight * settings.bladeMaxScale;
  u.uCullPadNdcX.value = settings.cullPadNdcX;
  u.uCullPadNdcYNear.value = settings.cullPadNdcYNear;
  u.uCullPadNdcYFar.value = settings.cullPadNdcYFar;
  u.uGrassCullDebug.value = import.meta.env.DEV && settings.cullDebug ? 1 : 0;
  u.uGrassLodColorDebug.value = import.meta.env.DEV && settings.lodColorDebug ? 1 : 0;
  u.uGrassTileCullEnabled.value = settings.tileCullEnabled ? 1 : 0;
  u.uWindStrength.value = settings.windStrength;
  u.uWindSpeed.value = settings.windSpeed;
  u.uWindUvScale.value = settings.windUvScale;
  u.uAmbientSwayStrength.value = settings.ambientSwayStrength;
  u.uWindLull.value = settings.windLull;
  u.uWindEddyStrength.value = settings.windEddyStrength;
  u.uWindGustCoverage.value = settings.windGustCoverage;
  u.uDetailedWindRadius.value = settings.detailedWindRadius;
  u.uWindCurveP1.value = settings.windCurveP1;
  u.uWindCurveP2.value = settings.windCurveP2;
  u.uBendDropStrength.value = settings.bendDropStrength;
  u.uBendControlPoint.value = settings.bendControlPoint;
  u.uSpriteRotationRandomness.value = settings.spriteRotationRandomness;
  u.uBladeHeight.value = settings.bladeHeight;
  u.uBladeMinScale.value = settings.bladeMinScale;
  u.uBladeMaxScale.value = settings.bladeMaxScale;
  u.uColorMixFactor.value = settings.colorMixFactor;
  u.uColorVariationStrength.value = settings.colorVariationStrength;
  u.uRustVariationStrength.value = settings.rustVariationStrength;
  u.uWarmVariationStrength.value = settings.warmVariationStrength;
  u.uAoRadius.value = settings.aoRadius;
  u.uAoRimSmoothness.value = settings.aoRimSmoothness;
  u.uAoScale.value = settings.aoScale;
  u.uSheenStrength.value = settings.sheenStrength;
  u.uTransmissionStrength.value = settings.transmissionStrength;
  u.uBaseWindShade.value = settings.baseWindShade;
  u.uBaseShadeHeight.value = settings.baseShadeHeight;
  u.uBaseBending.value = settings.baseBending;
  u.uBiomeGrassThreshold.value = settings.biomeGrassThreshold;
  u.uBiomeGrassFadeWidth.value = settings.biomeGrassFadeWidth;
  u.uGrassTransitionMinScale.value = settings.transitionMinBladeScale;
  u.uWidthFarGain.value = settings.widthFarGain;
  const widthNear = Math.max(0, settings.widthNearRadius);
  const widthFar = Math.max(widthNear + 0.01, settings.widthFarRadius);
  u.uWidthNearRadiusSquared.value = widthNear * widthNear;
  u.uWidthFarRadiusSquared.value = widthFar * widthFar;
  u.uProjectedHeightMin.value = settings.projectedHeightMin;
  u.uProjectedHeightFull.value = settings.projectedHeightFull;
  u.uStochasticHysteresis.value = settings.stochasticHysteresis;
  u.uClumpStrength.value = settings.clumpStrength;
  u.uClumpScaleM.value = settings.clumpScaleM;
  u.uClumpCoverage.value = settings.clumpCoverage;
  u.uClumpSoftness.value = settings.clumpSoftness;
  u.uClumpEdgeMinScale.value = settings.clumpEdgeMinScale;
  u.uClumpEdgeDensityBoost.value = settings.clumpEdgeDensityBoost;
  u.uSurfaceBias.value = settings.surfaceBias;
  u.uTrailGrowthRate.value = settings.trailGrowthRate;
  u.uTrailMinScale.value = settings.trailMinScale;
  u.uTrailRadius.value = settings.trailRadius;
  u.uTrailRadiusSquared.value = settings.trailRadius * settings.trailRadius;
  u.uTrailBendStrength.value = settings.trailBendStrength;
  u.uKDown.value = settings.trailKDown;
  u.uPlayerGlowMul.value = settings.playerGlowMul;
  const fl = settings.foliageLighting;
  u.uWrapStrength.value = fl.wrapStrength;
  u.uHemisphereStrength.value = fl.hemisphereStrength;
  u.uSkyTint.value.set(fl.skyTint);
  u.uGroundTint.value.set(fl.groundTint);
  u.uBacklightStrength.value = fl.backlightStrength;
  u.uBacklightPunchThrough.value = fl.backlightPunchThrough;
  u.uBacklightTint.value.set(fl.backlightTint);
  u.uBaseColor.value.set(settings.baseColor);
  u.uBaseColorDark.value.set(settings.baseColorDark);
  u.uTipColor.value.set(settings.tipColor);
  u.uRustColor.value.set(settings.rustColor);
  u.uWarmColor.value.set(settings.warmColor);
  const f = settings.flowers;
  u.uFlowerBoundsRadius.value = f.boundsRadius;
  u.uFlowerGrassThreshold.value = f.grassThreshold;
  u.uFlowerColor1.value.set(f.color1);
  u.uFlowerColor2.value.set(f.color2);
  u.uFlowerColorStrength.value = f.colorStrength;
  u.uFlowerMinScale.value = f.minScale;
  u.uFlowerMaxScale.value = f.maxScale;
  u.uFlowerHeightOffset.value = f.heightOffset;
}

export function applyGrassRingDevUniforms(
  ringUniforms: GrassRingUniforms,
  ring: {
    innerRadius: number;
    outerRadius: number;
    tileSize: number;
    bladesPerSide: number;
    bladeWidth: number;
    fadeBandM?: number;
    fadeInBandM?: number;
  },
  bladeHeight: number,
  bladeMaxScale: number,
): void {
  ringUniforms.uInnerRadius.value = ring.innerRadius;
  ringUniforms.uOuterRadius.value = ring.outerRadius;
  ringUniforms.uTileSize.value = ring.tileSize;
  ringUniforms.uBladesPerSide.value = ring.bladesPerSide;
  ringUniforms.uFadeBandM.value = ring.fadeBandM ?? 0;
  ringUniforms.uFadeInBandM.value = ring.fadeInBandM ?? 0;
  ringUniforms.uBladeBoundsRadius.value = computeGrassRingBoundsRadius(
    ring.bladeWidth,
    bladeHeight,
    bladeMaxScale,
  );
}
