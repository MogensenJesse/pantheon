// src/world/grass/applyGrassDevUniforms.ts — sync devSettings.grass → GPU uniforms
import { devSettings } from '../../core/GameState';
import { VISUAL } from '../../config/visualTuning';
import { grassUniforms } from './grassUniforms';

export function applyGrassDevUniforms(): void {
  const g = devSettings.grass;
  grassUniforms.uWindStrength.value = g.windStrength;
  grassUniforms.uWindSpeed.value = g.windSpeed;
  grassUniforms.uR0.value = g.thinningR0;
  grassUniforms.uR1.value = g.thinningR1;
  grassUniforms.uPMin.value = g.thinningPMin;
  grassUniforms.uBladeMinScale.value = g.bladeMinScale;
  grassUniforms.uBladeMaxScale.value = g.bladeMaxScale;
}

export function resetGrassDevSettings(): void {
  const g = devSettings.grass;
  const d = VISUAL.grass;
  g.windStrength = d.windStrength;
  g.windSpeed = d.windSpeed;
  g.thinningR0 = d.thinningR0;
  g.thinningR1 = d.thinningR1;
  g.thinningPMin = d.thinningPMin;
  g.bladeMinScale = d.bladeMinScale;
  g.bladeMaxScale = d.bladeMaxScale;
  g.enabled = true;
  applyGrassDevUniforms();
}

export function applyGrassDevColors(baseHex: string, tipHex: string): void {
  grassUniforms.uBaseColor.value.set(baseHex);
  grassUniforms.uTipColor.value.set(tipHex);
}
