// src/world/grass/config/applyGrassDevUniforms.ts — sync devSettings.grass → GPU uniforms

import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { applyFlowerRingUniforms, type FlowerRingUniforms } from './flowerUniforms';
import { cloneFlowerSettings, readFlowerLayout } from './flowerConfig';
import { readGrassRingLayout } from './grassConfig';
import { syncAllGrassRingsDerived } from './grassFieldMetrics';
import {
  applyGrassRingDevUniforms,
  applyGrassSharedDevUniforms,
  type GrassRingUniforms,
} from './grassUniforms';

let registeredRingUniforms: GrassRingUniforms[] = [];
let registeredFlowerRingUniforms: FlowerRingUniforms | null = null;

export function registerGrassRingUniforms(uniforms: GrassRingUniforms[]): void {
  registeredRingUniforms = uniforms;
}

export function registerFlowerRingUniforms(uniforms: FlowerRingUniforms | null): void {
  registeredFlowerRingUniforms = uniforms;
}

export function applyFlowerDevUniforms(): void {
  if (!registeredFlowerRingUniforms) return;
  const layout = readFlowerLayout();
  applyFlowerRingUniforms(registeredFlowerRingUniforms, {
    flowersPerSide: layout.flowersPerSide,
    innerRadius: layout.innerRadius,
    outerRadius: layout.outerRadius,
    tileSize: layout.tileSize,
    fadeBandM: layout.fadeBandM,
    fadeInBandM: layout.fadeInBandM,
  });
}

export function markGrassDevDirty(): void {
  devSettings.grass.dirty = true;
}

export function applyGrassDevUniforms(force = false): void {
  const g = devSettings.grass;
  if (!force && !g.dirty) return;
  g.dirty = false;
  syncAllGrassRingsDerived(
    g.rings,
    g.ringDerived,
    g.maxInstancesPerRing,
    g.ringFadeBandM,
    g.ringFadeBandLod12M,
    g.maxBladesPerSide,
    g.ringFadeInLod2M,
  );
  applyGrassSharedDevUniforms(g);
  applyFlowerDevUniforms();
  for (let i = 0; i < registeredRingUniforms.length; i++) {
    const layout = readGrassRingLayout(i);
    applyGrassRingDevUniforms(registeredRingUniforms[i]!, layout, g.bladeHeight, g.bladeMaxScale);
  }
}

export function resetGrassDevSettings(): void {
  const g = devSettings.grass;
  const d = VISUAL.grass;
  g.rings = structuredClone(d.rings) as typeof g.rings;
  g.ringDerived = [
    {
      innerRadius: 0,
      outerRadius: 0,
      tileSize: 0,
      bladesPerSide: 0,
      instanceCount: 0,
      fadeBandM: 0,
      fadeInBandM: 0,
    },
    {
      innerRadius: 0,
      outerRadius: 0,
      tileSize: 0,
      bladesPerSide: 0,
      instanceCount: 0,
      fadeBandM: 0,
      fadeInBandM: 0,
    },
    {
      innerRadius: 0,
      outerRadius: 0,
      tileSize: 0,
      bladesPerSide: 0,
      instanceCount: 0,
      fadeBandM: 0,
      fadeInBandM: 0,
    },
  ];
  g.maxInstancesPerRing = d.maxInstancesPerRing;
  g.maxBladesPerSide = d.maxBladesPerSide;
  g.bladeHeight = d.bladeHeight;
  g.windStrength = d.windStrength;
  g.windSpeed = d.windSpeed;
  g.cullPadNdcX = d.cullPadNdcX;
  g.cullPadNdcYNear = d.cullPadNdcYNear;
  g.cullPadNdcYFar = d.cullPadNdcYFar;
  g.bladeMinScale = d.bladeMinScale;
  g.bladeMaxScale = d.bladeMaxScale;
  g.colorMixFactor = d.colorMixFactor;
  g.colorVariationStrength = d.colorVariationStrength;
  g.baseWindShade = d.baseWindShade;
  g.baseShadeHeight = d.baseShadeHeight;
  g.baseBending = d.baseBending;
  g.biomeGrassThreshold = d.biomeGrassThreshold;
  g.biomeGrassFadeWidth = d.biomeGrassFadeWidth;
  g.transitionMinBladeScale = d.transitionMinBladeScale;
  g.ringFadeBandM = d.ringFadeBandM;
  g.ringFadeBandLod12M = d.ringFadeBandLod12M;
  g.ringFadeInLod2M = d.ringFadeInLod2M;
  g.surfaceBias = d.surfaceBias;
  g.trailGrowthRate = d.trailGrowthRate;
  g.trailMinScale = d.trailMinScale;
  g.trailRadius = d.trailRadius;
  g.trailKDown = d.trailKDown;
  g.playerGlowMul = d.playerGlowMul;
  g.foliageLighting = structuredClone(d.foliageLighting) as typeof g.foliageLighting;
  g.baseColor = d.baseColor;
  g.tipColor = d.tipColor;
  g.enabled = true;
  g.cullDebug = false;
  g.lodColorDebug = false;
  g.dirty = true;
  g.flowers = cloneFlowerSettings(d.flowers);
  applyGrassDevUniforms(true);
}
