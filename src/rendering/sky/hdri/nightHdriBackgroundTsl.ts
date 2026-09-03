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
import { applySkyHorizonHaze } from '../../atmosphere/skyHorizonHazeTsl';
import { getValleyFogSkyVolumeNode, getValleyFogUniforms } from '../../atmosphere/valleyFog';

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

/** Equirect HDRI background with smooth luminance falloff near the horizon. */
export function createNightHdriBackgroundNode(
  equirectTexture: Texture,
  horizon: NightHdriHorizonDimUniforms,
) {
  const hdri = texture(equirectTexture, equirectUV(positionWorldDirection));
  const elev = abs(positionWorldDirection.y);
  const dimT = smoothstep(horizon.dimStart, horizon.dimEnd, elev);
  const dim = mix(horizon.dimMin, float(1), dimT);
  const dimmed = hdri.mul(dim);
  const fogU = getValleyFogUniforms();
  const nightVolume = getValleyFogSkyVolumeNode();
  if (!fogU || !nightVolume) return dimmed;
  const hazedRgb = applySkyHorizonHaze(
    dimmed.xyz,
    fogU.uFogColor as any,
    fogU.uAerialStrength,
    nightVolume,
    fogU.uSkyHorizonStart,
    fogU.uSkyHorizonEnd,
  );
  return vec4(hazedRgb, dimmed.w);
}
