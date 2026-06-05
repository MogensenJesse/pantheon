// src/world/grass/applyGrassDevUniforms.ts — sync devSettings.grass → GPU uniforms
import { devSettings } from '../../core/GameState';
import { VISUAL } from '../../config/visualTuning';
import { syncAllGrassRingsDerived } from './grassFieldMetrics';
import { cloneFlowerSettings, readFlowerLayout } from './flowers/flowerConfig';
import {
  applyGrassRingDevUniforms,
  applyGrassSharedDevUniforms,
  type GrassRingUniforms,
} from './grassUniforms';
import { applyFlowerRingUniforms, type FlowerRingUniforms } from './flowers/flowerSsbo';

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
  });
}

export function applyGrassDevUniforms(): void {
  const g = devSettings.grass;
  syncAllGrassRingsDerived(g.rings, g.maxInstancesPerRing);
  applyGrassSharedDevUniforms(g);
  applyFlowerDevUniforms();
  for (let i = 0; i < registeredRingUniforms.length; i++) {
    const ring = g.rings[i];
    if (ring) applyGrassRingDevUniforms(registeredRingUniforms[i]!, ring);
  }
}

export function resetGrassDevSettings(): void {
  const g = devSettings.grass;
  const d = VISUAL.grass;
  g.rings = [
    { ...d.rings[0], innerRadius: 0, outerRadius: 0, tileSize: 0, bladesPerSide: 0, instanceCount: 0 },
    { ...d.rings[1], innerRadius: 0, outerRadius: 0, tileSize: 0, bladesPerSide: 0, instanceCount: 0 },
    { ...d.rings[2], innerRadius: 0, outerRadius: 0, tileSize: 0, bladesPerSide: 0, instanceCount: 0 },
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
  g.aoScale = d.aoScale;
  g.aoRimSmoothness = d.aoRimSmoothness;
  g.aoRadius = d.aoRadius;
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
  g.baseColor = d.baseColor;
  g.tipColor = d.tipColor;
  g.enabled = true;
  g.flowers = cloneFlowerSettings(d.flowers);
  applyGrassDevUniforms();
}
