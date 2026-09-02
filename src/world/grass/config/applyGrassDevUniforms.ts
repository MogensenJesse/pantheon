// src/world/grass/config/applyGrassDevUniforms.ts — sync devSettings.grass → GPU uniforms

import { devSettings } from '../../../core/GameState';
import { createGrassFromVisual } from '../../../core/state/runtimeSettings';
import { readFlowerLayout } from './flowerConfig';
import { applyFlowerRingUniforms, type FlowerRingUniforms } from './flowerUniforms';
import { readGrassRingLayout } from './grassConfig';
import {
  applyGrassRingUniforms,
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
  applyFlowerRingUniforms(registeredFlowerRingUniforms, readFlowerLayout());
}

export function markGrassDevDirty(): void {
  devSettings.grass.dirty = true;
}

export function applyGrassDevUniforms(force = false): void {
  const g = devSettings.grass;
  if (!force && !g.dirty) return;
  g.dirty = false;
  applyGrassSharedDevUniforms(g);
  applyFlowerDevUniforms();
  for (let i = 0; i < registeredRingUniforms.length; i++) {
    applyGrassRingUniforms(
      registeredRingUniforms[i]!,
      readGrassRingLayout(i),
      g.bladeHeight,
      g.bladeMaxScale,
    );
  }
}

export function resetGrassDevSettings(): void {
  const next = createGrassFromVisual();
  next.dirty = true;
  Object.assign(devSettings.grass, next);
  applyGrassDevUniforms(true);
}
