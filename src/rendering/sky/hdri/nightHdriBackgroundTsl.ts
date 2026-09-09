// src/rendering/sky/hdri/nightHdriBackgroundTsl.ts — equirect night sky with horizon dimming
import {
  abs,
  equirectUV,
  float,
  mix,
  positionWorldDirection,
  smoothstep,
  texture,
  uniform,
  vec4,
} from 'three/tsl';
import type { Texture } from 'three/webgpu';
import {
  applySkyHorizonHaze,
  getValleyFogSkyVolumeNode,
  getValleyFogUniforms,
} from '../../atmosphere';

type TslNode = any;

export interface NightHdriHorizonDimUniforms {
  dimStart: TslNode;
  dimEnd: TslNode;
  dimMin: TslNode;
}

export interface NightHdriHorizonDimDefaults {
  dimStart: number;
  dimEnd: number;
  dimMin: number;
}

export function createNightHdriHorizonDimUniforms(
  defaults: NightHdriHorizonDimDefaults,
): NightHdriHorizonDimUniforms {
  return {
    dimStart: uniform(defaults.dimStart),
    dimEnd: uniform(defaults.dimEnd),
    dimMin: uniform(defaults.dimMin),
  };
}

export function syncNightHdriHorizonDimUniforms(
  uniforms: NightHdriHorizonDimUniforms,
  values: NightHdriHorizonDimDefaults,
): void {
  uniforms.dimStart.value = values.dimStart;
  uniforms.dimEnd.value = values.dimEnd;
  uniforms.dimMin.value = values.dimMin;
}

/**
 * Equirect HDRI background with horizon luma falloff.
 * `intensity` is the old `scene.backgroundIntensity` (weight × tuning). Apply it
 * *before* valley fog mix — Three.js still multiplies `backgroundNode` by
 * `scene.backgroundIntensity`, so that must stay 1 or fog tint is crushed to black.
 */
export function createNightHdriBackgroundNode(
  equirectTexture: Texture,
  horizon: NightHdriHorizonDimUniforms,
  intensity: TslNode,
) {
  const hdri = texture(equirectTexture, equirectUV(positionWorldDirection));
  const elev = abs(positionWorldDirection.y);
  const dimT = smoothstep(horizon.dimStart, horizon.dimEnd, elev);
  const dim = mix(horizon.dimMin, float(1), dimT);
  const presented = hdri.mul(dim).mul(intensity);
  const fogU = getValleyFogUniforms();
  const nightVolume = getValleyFogSkyVolumeNode();
  if (!fogU || !nightVolume) {
    throw new Error('createNightHdriBackgroundNode requires initValleyFog first (horizon haze).');
  }
  const hazedRgb = applySkyHorizonHaze(
    presented.xyz,
    fogU.uFogColor as any,
    fogU.uSkyHorizonStrength,
    nightVolume,
    fogU.uSkyHorizonStart,
    fogU.uSkyHorizonEnd,
  );
  return vec4(hazedRgb, presented.w);
}
