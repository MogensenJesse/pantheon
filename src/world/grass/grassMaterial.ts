// src/world/grass/grassMaterial.ts — SpriteNodeMaterial grass blades (Revo-inspired)
import {
  INFINITY,
  PI2,
  float,
  hash,
  instanceIndex,
  length,
  mix,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import type { GrassSsbo } from './grassSsbo';
import { grassUniforms } from './grassUniforms';

export function createGrassMaterial(ssbo: GrassSsbo): SpriteNodeMaterial {
  const {
    uBaseBending,
    uCameraForward,
    uTime,
    uWindDirection,
    uWindSpeed,
    uAoRadiusSquared,
    uAoRimSmoothness,
    uAoScale,
    uColorMixFactor,
    uColorVariationStrength,
    uBaseColor,
    uTipColor,
    uBaseShadeHeight,
    uBaseWindShade,
    uSunIntensity,
    uPlayerGlowMul,
  } = grassUniforms;

  const material = new SpriteNodeMaterial();
  material.precision = 'lowp';
  material.transparent = false;
  material.stencilWrite = false;
  material.forceSinglePass = true;

  const data1 = ssbo.bufferA.element(instanceIndex);
  const data2 = ssbo.bufferB.element(instanceIndex);
  const offsetX = data1.x;
  const offsetZ = data1.y;
  const windXZ = vec2(data1.z, data1.w);
  const yOffset = data2.x;
  const scaleY = data2.y;
  const isVisible = data2.z;
  const positionNoise = hash(instanceIndex.add(196.4356));

  material.opacityNode = isVisible;

  const scaleX = positionNoise.remap(0, 1, 0.5, 1.5);
  const bladeScale = vec3(scaleX, scaleY, 1);
  material.scaleNode = mix(vec3(0), bladeScale, isVisible);

  const h = uv().y;
  const bendProfile = h.mul(h).mul(uBaseBending);
  const instanceNoise = positionNoise.sub(0.5).mul(0.25);
  const baseBending = instanceNoise.mul(bendProfile);
  material.rotationNode = vec3(baseBending, 0, 0);

  const offscreenOffset = uCameraForward.mul(INFINITY).mul(float(1).sub(isVisible));
  const bladePosition = vec3(offsetX, yOffset, offsetZ);

  const randomPhase = positionNoise.mul(PI2);
  const swayAmount = sin(uTime.mul(5).add(randomPhase)).mul(0.15);
  const swayFactor = uv().y.mul(length(windXZ));
  const swayOffset = swayAmount.mul(swayFactor);

  const dirXZ = uWindDirection;
  const perp = vec2(dirXZ.y.negate(), dirXZ.x);
  const phase = hash(instanceIndex).mul(PI2);
  const flutter = sin(uTime.mul(uWindSpeed.mul(1.7)).add(phase.mul(1.3))).mul(0.06).mul(bendProfile);
  const flutterOffset = vec3(perp.x, 0, perp.y).mul(flutter);

  const windY = float(1).sub(h.mul(h)).mul(0.25);
  const windOffset = vec3(windXZ.x, windY, windXZ.y).mul(bendProfile);

  material.positionNode = bladePosition
    .add(offscreenOffset)
    .add(swayOffset)
    .add(flutterOffset)
    .add(windOffset);

  const r2 = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
  const near = float(1).sub(smoothstep(0, uAoRadiusSquared, r2));
  const edge = uv().x.mul(2).sub(1).abs();
  const rim = smoothstep(uAoRimSmoothness.negate(), uAoRimSmoothness, edge);
  const hWeight = float(1).sub(smoothstep(0.1, 0.85, h));
  const aoStrength = uAoScale.mul(0.25);
  const ao = float(1).sub(aoStrength.mul(near.mul(rim).mul(hWeight)));

  const colorProfile = h.mul(uColorMixFactor);
  const jitter = smoothstep(0, uColorVariationStrength, positionNoise);
  const baseColorJittered = uBaseColor.mul(jitter);
  const baseToTip = mix(baseColorJittered, uTipColor, colorProfile);

  const baseMask = float(1).sub(smoothstep(0, uBaseShadeHeight, h));
  const windAo = mix(float(1), float(1).sub(uBaseWindShade), baseMask.mul(smoothstep(0, 1, swayFactor)));

  const nightMul = mix(float(0.45), float(1), uSunIntensity.clamp());
  const glowBoost = float(1).add(uPlayerGlowMul.mul(0.35));
  material.colorNode = baseToTip.mul(windAo).mul(ao).mul(nightMul).mul(glowBoost);

  return material;
}
