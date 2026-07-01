// src/world/grass/config/applyGrassDevUniforms.ts — sync devSettings.grass → GPU uniforms

import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { applyFlowerRingUniforms, type FlowerRingUniforms } from '../compute/flowerSsbo';
import { cloneFlowerSettings } from './flowerConfig';
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
  const g = devSettings.grass;
  const layout = syncAllGrassRingsDerived(g.rings, g.ringDerived, g.maxInstancesPerRing);
  const ring1 = layout.rings[1]!;
  applyFlowerRingUniforms(registeredFlowerRingUniforms, {
    flowersPerSide: g.flowers.flowersPerSide,
    innerRadius: ring1.innerRadius,
    outerRadius: ring1.outerRadius,
    tileSize: ring1.tileSize,
  });
}

export function applyGrassDevUniforms(): void {
  const g = devSettings.grass;
  syncAllGrassRingsDerived(g.rings, g.ringDerived, g.maxInstancesPerRing);
  applyGrassSharedDevUniforms(g);
  applyFlowerDevUniforms();
  for (let i = 0; i < registeredRingUniforms.length; i++) {
    const derived = g.ringDerived[i];
    if (derived) applyGrassRingDevUniforms(registeredRingUniforms[i]!, derived);
  }
}

export function resetGrassDevSettings(): void {
  const g = devSettings.grass;
  const d = VISUAL.grass;
  g.rings = structuredClone(d.rings) as typeof g.rings;
  g.ringDerived = [
    { innerRadius: 0, outerRadius: 0, tileSize: 0, bladesPerSide: 0, instanceCount: 0 },
    { innerRadius: 0, outerRadius: 0, tileSize: 0, bladesPerSide: 0, instanceCount: 0 },
    { innerRadius: 0, outerRadius: 0, tileSize: 0, bladesPerSide: 0, instanceCount: 0 },
  ];
  g.maxInstancesPerRing = d.maxInstancesPerRing;
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
  g.trailGrowthRate = d.trailGrowthRate;
  g.trailMinScale = d.trailMinScale;
  g.trailRadius = d.trailRadius;
  g.trailKDown = d.trailKDown;
  g.playerGlowMul = d.playerGlowMul;
  g.foliageLighting = structuredClone(d.foliageLighting) as typeof g.foliageLighting;
  g.baseColor = d.baseColor;
  g.tipColor = d.tipColor;
  g.enabled = true;
  g.flowers = cloneFlowerSettings(d.flowers);
  applyGrassDevUniforms();
}
