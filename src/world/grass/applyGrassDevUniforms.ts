// src/world/grass/applyGrassDevUniforms.ts — sync devSettings.grass → GPU uniforms
import { devSettings } from '../../core/GameState';
import { VISUAL } from '../../config/visualTuning';
import { grassUniforms } from './grassUniforms';

export function applyGrassDevUniforms(): void {
  const g = devSettings.grass;
  grassUniforms.uTileSize.value = g.tileSize;
  grassUniforms.uBladesPerSide.value = g.bladesPerSide;
  grassUniforms.uWindStrength.value = g.windStrength;
  grassUniforms.uWindSpeed.value = g.windSpeed;
  grassUniforms.uR0.value = g.thinningR0;
  grassUniforms.uR1.value = g.thinningR1;
  grassUniforms.uPMin.value = g.thinningPMin;
  grassUniforms.uBladeMinScale.value = g.bladeMinScale;
  grassUniforms.uBladeMaxScale.value = g.bladeMaxScale;
  grassUniforms.uColorMixFactor.value = g.colorMixFactor;
  grassUniforms.uColorVariationStrength.value = g.colorVariationStrength;
  grassUniforms.uAoScale.value = g.aoScale;
  grassUniforms.uAoRimSmoothness.value = g.aoRimSmoothness;
  grassUniforms.uAoRadiusSquared.value = g.aoRadius * g.aoRadius;
  grassUniforms.uBaseWindShade.value = g.baseWindShade;
  grassUniforms.uBaseShadeHeight.value = g.baseShadeHeight;
  grassUniforms.uBaseBending.value = g.baseBending;
  grassUniforms.uBiomeGrassThreshold.value = g.biomeGrassThreshold;
  grassUniforms.uTrailGrowthRate.value = g.trailGrowthRate;
  grassUniforms.uTrailMinScale.value = g.trailMinScale;
  grassUniforms.uTrailRadiusSquared.value = g.trailRadius * g.trailRadius;
  grassUniforms.uKDown.value = g.trailKDown;
  grassUniforms.uPlayerGlowMul.value = g.playerGlowMul;
  grassUniforms.uBaseColor.value.set(g.baseColor);
  grassUniforms.uTipColor.value.set(g.tipColor);
  grassUniforms.uDebugMaskViz.value = g.debugMaskViz ? 1 : 0;
}

export function resetGrassDevSettings(): void {
  const g = devSettings.grass;
  const d = VISUAL.grass;
  g.segments = d.segments;
  g.bladeWidth = d.bladeWidth;
  g.bladeHeight = d.bladeHeight;
  g.tileSize = d.tileSize;
  g.bladesPerSide = d.bladesPerSide;
  g.windStrength = d.windStrength;
  g.windSpeed = d.windSpeed;
  g.thinningR0 = d.thinningR0;
  g.thinningR1 = d.thinningR1;
  g.thinningPMin = d.thinningPMin;
  g.bladeMinScale = d.bladeMinScale;
  g.bladeMaxScale = d.bladeMaxScale;
  g.colorMixFactor = d.colorMixFactor;
  g.colorVariationStrength = d.colorVariationStrength;
  g.aoScale = d.aoScale;
  g.aoRimSmoothness = d.aoRimSmoothness;
  g.aoRadius = d.aoRadius;
  g.baseWindShade = d.baseWindShade;
  g.baseShadeHeight = d.baseShadeHeight;
  g.baseBending = d.baseBending;
  g.biomeGrassThreshold = d.biomeGrassThreshold;
  g.trailGrowthRate = d.trailGrowthRate;
  g.trailMinScale = d.trailMinScale;
  g.trailRadius = d.trailRadius;
  g.trailKDown = d.trailKDown;
  g.playerGlowMul = d.playerGlowMul;
  g.baseColor = d.baseColor;
  g.tipColor = d.tipColor;
  g.debugMaskViz = false;
  g.enabled = true;
  applyGrassDevUniforms();
}
