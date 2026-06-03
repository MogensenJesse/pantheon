// src/world/grass/grassUniforms.ts — shared CPU/GPU grass uniforms + per-ring bundles
import { Color, Matrix4, Vector2, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import type { GrassDevSettings } from '../../core/GameState';
import { VISUAL } from '../../config/visualTuning';

const g = VISUAL.grass;

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
  uAoScale: uniform(g.aoScale),
  uAoRimSmoothness: uniform(g.aoRimSmoothness),
  uAoRadiusSquared: uniform(g.aoRadius * g.aoRadius),
  uBaseWindShade: uniform(g.baseWindShade),
  uBaseShadeHeight: uniform(g.baseShadeHeight),
  uBaseBending: uniform(g.baseBending),
  uWorldSize: uniform(0),
  uHeightScale: uniform(0),
  uSurfaceBias: uniform(g.surfaceBias),
  uBiomeGrassThreshold: uniform(g.biomeGrassThreshold),
  uForestDensity: uniform(1),
  uHillsDensity: uniform(1),
  uShoreDensity: uniform(1),
  uDebugMaskViz: uniform(0),
  uTime: uniform(0),
  uTrailGrowthRate: uniform(g.trailGrowthRate),
  uTrailMinScale: uniform(g.trailMinScale),
  uTrailRadiusSquared: uniform(g.trailRadius * g.trailRadius),
  uKDown: uniform(g.trailKDown),
  uPlayerGlowMul: uniform(g.playerGlowMul),
  uSunIntensity: uniform(0),
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

/** @deprecated Use grassSharedUniforms — alias for existing imports. */
export const grassUniforms = grassSharedUniforms;

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
  u.uAoScale.value = settings.aoScale;
  u.uAoRimSmoothness.value = settings.aoRimSmoothness;
  u.uAoRadiusSquared.value = settings.aoRadius * settings.aoRadius;
  u.uBaseWindShade.value = settings.baseWindShade;
  u.uBaseShadeHeight.value = settings.baseShadeHeight;
  u.uBaseBending.value = settings.baseBending;
  u.uBiomeGrassThreshold.value = settings.biomeGrassThreshold;
  u.uSurfaceBias.value = settings.surfaceBias;
  u.uTrailGrowthRate.value = settings.trailGrowthRate;
  u.uTrailMinScale.value = settings.trailMinScale;
  u.uTrailRadiusSquared.value = settings.trailRadius * settings.trailRadius;
  u.uKDown.value = settings.trailKDown;
  u.uPlayerGlowMul.value = settings.playerGlowMul;
  u.uBaseColor.value.set(settings.baseColor);
  u.uTipColor.value.set(settings.tipColor);
  u.uDebugMaskViz.value = settings.debugMaskViz ? 1 : 0;
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
