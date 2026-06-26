// src/world/grass/grassUniforms.ts — shared CPU/GPU grass uniforms + per-ring bundles
import { Color, Matrix4, Vector2, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import type { GrassDevSettings } from '../../../core/GameState';
import { GRASS_SHADOW_FLOOR_DEFAULT } from '../../../rendering/sunShadow';
import { readFlowerWorldSpacing } from './flowerConfig';
import { deriveGrassRingsLayout } from './grassFieldMetrics';

const g = VISUAL.grass;
const fl = g.foliageLighting;

const defaultFlowerSpacing = (): number => {
  const layout = deriveGrassRingsLayout(
    VISUAL.grass.rings as never,
    VISUAL.grass.maxInstancesPerRing,
  );
  const outerMid = layout.rings[1]!.outerRadius;
  const tile = outerMid * 2;
  return tile / Math.max(8, g.flowers.flowersPerSide);
};

/** Shared across all ring fields (wind, color, biome, trail, cull pads). */
export const grassSharedUniforms = {
  uCameraMatrix: uniform(new Matrix4()),
  uFx: uniform(1),
  uFy: uniform(1),
  uBladeBoundsRadius: uniform(g.bladeHeight),
  uCullPadNdcX: uniform(g.cullPadNdcX),
  uCullPadNdcYNear: uniform(g.cullPadNdcYNear),
  uCullPadNdcYFar: uniform(g.cullPadNdcYFar),
  uPlayerPosition: uniform(new Vector3()),
  uPlayerDeltaXZ: uniform(new Vector2()),
  uPlayerRadius: uniform(0.5),
  uCameraForward: uniform(new Vector3(0, 0, -1)),
  uWindDirection: uniform(new Vector2(0.85, 0.35).normalize()),
  uWindStrength: uniform(g.windStrength),
  uWindSpeed: uniform(g.windSpeed),
  uBladeMinScale: uniform(g.bladeMinScale),
  uBladeMaxScale: uniform(g.bladeMaxScale),
  uBaseColor: uniform(new Color(g.baseColor)),
  uTipColor: uniform(new Color(g.tipColor)),
  uColorMixFactor: uniform(g.colorMixFactor),
  uColorVariationStrength: uniform(g.colorVariationStrength),
  uBaseWindShade: uniform(g.baseWindShade),
  uBaseShadeHeight: uniform(g.baseShadeHeight),
  uBaseBending: uniform(g.baseBending),
  uWorldSize: uniform(0),
  uHeightScale: uniform(0),
  uSurfaceBias: uniform(g.surfaceBias),
  uBiomeGrassThreshold: uniform(g.biomeGrassThreshold),
  uBiomeGrassFadeWidth: uniform(g.biomeGrassFadeWidth),
  uGrassTransitionMinScale: uniform(g.transitionMinBladeScale),
  uMeadowDensity: uniform(g.biomeDensity.meadow),
  uForestDensity: uniform(g.biomeDensity.forest),
  uHillsDensity: uniform(g.biomeDensity.hills),
  uShoreDensity: uniform(g.biomeDensity.shore),
  uMountainDensity: uniform(g.biomeDensity.mountain),
  uPathDensity: uniform(g.biomeDensity.path),
  uTime: uniform(0),
  uTrailGrowthRate: uniform(g.trailGrowthRate),
  uTrailMinScale: uniform(g.trailMinScale),
  uTrailRadiusSquared: uniform(g.trailRadius * g.trailRadius),
  uKDown: uniform(g.trailKDown),
  uPlayerGlowMul: uniform(g.playerGlowMul),
  uDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
  uNightSkyDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
  uNightColorFloor: uniform(g.nightColorFloor),
  uShadowFloor: uniform(GRASS_SHADOW_FLOOR_DEFAULT),
  uLightRadius: uniform(6),
  uLightIntensity: uniform(2.2),
  uSunIntensity: uniform(0),
  uSunDirection: uniform(new Vector3(0.55, 0.75, 0.45).normalize()),
  uWrapStrength: uniform(fl.wrapStrength),
  uHemisphereStrength: uniform(fl.hemisphereStrength),
  uSkyTint: uniform(new Color(fl.skyTint)),
  uGroundTint: uniform(new Color(fl.groundTint)),
  uFlowerBoundsRadius: uniform(g.flowers.boundsRadius),
  uFlowerGrassThreshold: uniform(g.flowers.grassThreshold),
  uFlowerColor1: uniform(new Color(g.flowers.color1)),
  uFlowerColor2: uniform(new Color(g.flowers.color2)),
  uFlowerColorStrength: uniform(g.flowers.colorStrength),
  uFlowerMinScale: uniform(g.flowers.minScale),
  uFlowerMaxScale: uniform(g.flowers.maxScale),
  uFlowerHeightOffset: uniform(g.flowers.heightOffset),
  uFlowerSpacing: uniform(defaultFlowerSpacing()),
};

/** Per-ring layout uniforms (tile wrap + annulus radii). */
export interface GrassRingUniforms {
  uInnerRadius: ReturnType<typeof uniform>;
  uOuterRadius: ReturnType<typeof uniform>;
  uTileSize: ReturnType<typeof uniform>;
  uBladesPerSide: ReturnType<typeof uniform>;
}

export function createGrassRingUniforms(ring: {
  innerRadius: number;
  outerRadius: number;
  tileSize: number;
  bladesPerSide: number;
}): GrassRingUniforms {
  return {
    uInnerRadius: uniform(ring.innerRadius),
    uOuterRadius: uniform(ring.outerRadius),
    uTileSize: uniform(ring.tileSize),
    uBladesPerSide: uniform(ring.bladesPerSide),
  };
}

export function applyGrassSharedDevUniforms(settings: GrassDevSettings): void {
  const u = grassSharedUniforms;
  u.uBladeBoundsRadius.value = settings.bladeHeight;
  u.uCullPadNdcX.value = settings.cullPadNdcX;
  u.uCullPadNdcYNear.value = settings.cullPadNdcYNear;
  u.uCullPadNdcYFar.value = settings.cullPadNdcYFar;
  u.uWindStrength.value = settings.windStrength;
  u.uWindSpeed.value = settings.windSpeed;
  u.uBladeMinScale.value = settings.bladeMinScale;
  u.uBladeMaxScale.value = settings.bladeMaxScale;
  u.uColorMixFactor.value = settings.colorMixFactor;
  u.uColorVariationStrength.value = settings.colorVariationStrength;
  u.uBaseWindShade.value = settings.baseWindShade;
  u.uBaseShadeHeight.value = settings.baseShadeHeight;
  u.uBaseBending.value = settings.baseBending;
  u.uBiomeGrassThreshold.value = settings.biomeGrassThreshold;
  u.uBiomeGrassFadeWidth.value = settings.biomeGrassFadeWidth;
  u.uGrassTransitionMinScale.value = settings.transitionMinBladeScale;
  u.uSurfaceBias.value = settings.surfaceBias;
  u.uTrailGrowthRate.value = settings.trailGrowthRate;
  u.uTrailMinScale.value = settings.trailMinScale;
  u.uTrailRadiusSquared.value = settings.trailRadius * settings.trailRadius;
  u.uKDown.value = settings.trailKDown;
  u.uPlayerGlowMul.value = settings.playerGlowMul;
  u.uWrapStrength.value = settings.wrapStrength;
  u.uHemisphereStrength.value = settings.hemisphereStrength;
  u.uSkyTint.value.set(settings.skyTint);
  u.uGroundTint.value.set(settings.groundTint);
  u.uBaseColor.value.set(settings.baseColor);
  u.uTipColor.value.set(settings.tipColor);
  const f = settings.flowers;
  u.uFlowerBoundsRadius.value = f.boundsRadius;
  u.uFlowerGrassThreshold.value = f.grassThreshold;
  u.uFlowerColor1.value.set(f.color1);
  u.uFlowerColor2.value.set(f.color2);
  u.uFlowerColorStrength.value = f.colorStrength;
  u.uFlowerMinScale.value = f.minScale;
  u.uFlowerMaxScale.value = f.maxScale;
  u.uFlowerHeightOffset.value = f.heightOffset;
  u.uFlowerSpacing.value = readFlowerWorldSpacing(f.flowersPerSide);
}

export function applyGrassRingDevUniforms(
  ringUniforms: GrassRingUniforms,
  ring: {
    innerRadius: number;
    outerRadius: number;
    tileSize: number;
    bladesPerSide: number;
  },
): void {
  ringUniforms.uInnerRadius.value = ring.innerRadius;
  ringUniforms.uOuterRadius.value = ring.outerRadius;
  ringUniforms.uTileSize.value = ring.tileSize;
  ringUniforms.uBladesPerSide.value = ring.bladesPerSide;
}
