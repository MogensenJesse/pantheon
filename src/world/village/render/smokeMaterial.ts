// src/world/village/render/smokeMaterial.ts — chimney smoke puffs animated entirely in the shader
import { attribute, float, fract, mix, sin, smoothstep, vec3 } from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../../config/visualTuning';
import type { TslNode } from '../../grass/tsl/tslNode';
import { propShadowUniforms } from '../../mapProps/config/mapPropShadowUniforms';
import { uVillageTime } from './villageUniforms';

/**
 * Sprite material for the smoke puffs. Reads two instance attributes: `iEmit` (chimney top x, y, z
 * and a seed) and `iState` (strength, puff slot 0..1).
 */
export function createSmokeMaterial(): SpriteNodeMaterial {
  const SMOKE = VISUAL.village.SMOKE;
  const iEmit = attribute('iEmit', 'vec4');
  const iState = attribute('iState', 'vec4');
  const age = fract(uVillageTime.div(SMOKE.PUFF_PERIOD_S).add(iState.y).add(iEmit.w));
  const wind = vec3(0.8, 0, 0.35).mul(age.mul(age).mul(SMOKE.DRIFT_M));
  const wobble = vec3(
    sin(age.mul(7).add(iEmit.w.mul(40))),
    0,
    sin(age.mul(5).add(iEmit.w.mul(90))),
  ).mul(age.mul(0.35));
  const size = mix(float(0.45), float(2.1), age);
  const opacity = iState.x
    .mul(float(1).sub(age))
    .mul(smoothstep(float(0), float(0.12), age))
    .mul(0.45);
  const { uDaylight, uNightSkyDaylight } = propShadowUniforms;
  const day = smoothstep(uNightSkyDaylight as TslNode, float(1), uDaylight as TslNode);

  const material = new SpriteNodeMaterial();
  material.name = 'village_smoke';
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.positionNode = iEmit.xyz
    .add(vec3(0, age.mul(SMOKE.RISE_M), 0))
    .add(wind)
    .add(wobble);
  material.scaleNode = vec3(size, size, 1);
  material.colorNode = mix(vec3(0.1, 0.1, 0.12), vec3(0.78, 0.78, 0.8), day);
  material.opacityNode = opacity;
  return material;
}
