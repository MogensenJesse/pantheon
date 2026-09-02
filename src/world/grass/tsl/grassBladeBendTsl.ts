// src/world/grass/tsl/grassBladeBendTsl.ts — Revo bezier lean + Y drop + sprite yaw
import { float, hash, vec3 } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

export function grassSpriteRotation(sourceIndex: TslNode, bladeHeight: TslNode): TslNode {
  const { uBaseBending, uSpriteRotationRandomness } = grassSharedUniforms as any;
  const bladeHash = hash(sourceIndex);
  const instanceNoise = bladeHash.mul(0.25).sub(0.125);
  const spriteNoise = bladeHash.mul(31.7).fract().mul(2).sub(1);
  const spriteRotation = spriteNoise.mul(uSpriteRotationRandomness);
  const bendWeight = bladeHeight.mul(bladeHeight);
  const bendProfile = bendWeight.mul(uBaseBending);
  const positionNoise = hash(sourceIndex.add(196.4356));
  const baseBending = positionNoise.sub(0.5).mul(0.25).add(instanceNoise).mul(bendProfile);
  return spriteRotation.add(baseBending);
}

/** World-local offset from live wind+trail bend XZ (metres) and blade UV height. */
export function grassBendOffset(bendXZ: TslNode, bladeHeight: TslNode, scaleY: TslNode): TslNode {
  const { uBendDropStrength, uBendControlPoint, uBladeHeight } = grassSharedUniforms as any;
  const bendDrop = bendXZ
    .dot(bendXZ)
    .div(scaleY.mul(uBladeHeight.mul(2)).max(0.001))
    .mul(uBendDropStrength);
  const bendWeight = bladeHeight.mul(bladeHeight);
  const bendShape = uBendControlPoint
    .mul(2)
    .mul(bladeHeight)
    .mul(float(1).sub(bladeHeight))
    .add(bendWeight);
  return vec3(bendXZ.x, bendDrop.negate(), bendXZ.y).mul(bendShape);
}
