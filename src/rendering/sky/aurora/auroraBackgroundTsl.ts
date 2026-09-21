// src/rendering/sky/aurora/auroraBackgroundTsl.ts — procedural aurora as scene.backgroundNode
import { float, positionWorldDirection, screenSize, time, uniform, vec4 } from 'three/tsl';
import {
  applySkyHorizonHaze,
  getValleyFogSkyVolumeNode,
  getValleyFogUniforms,
} from '../../atmosphere';
import { auroraSkyWgsl } from './auroraWgsl';

type TslNode = any;

export interface AuroraBackgroundUniforms {
  intensity: TslNode;
  auroraStrength: TslNode;
  starStrength: TslNode;
  timeScale: TslNode;
}

export interface AuroraBackgroundDefaults {
  intensity: number;
  auroraStrength: number;
  starStrength: number;
  timeScale: number;
}

export function createAuroraBackgroundUniforms(
  defaults: AuroraBackgroundDefaults,
): AuroraBackgroundUniforms {
  return {
    intensity: uniform(defaults.intensity),
    auroraStrength: uniform(defaults.auroraStrength),
    starStrength: uniform(defaults.starStrength),
    timeScale: uniform(defaults.timeScale),
  };
}

export function syncAuroraBackgroundUniforms(
  uniforms: AuroraBackgroundUniforms,
  values: AuroraBackgroundDefaults,
): void {
  uniforms.intensity.value = values.intensity;
  uniforms.auroraStrength.value = values.auroraStrength;
  uniforms.starStrength.value = values.starStrength;
  uniforms.timeScale.value = values.timeScale;
}

/**
 * Procedural aurora + stars night background with the same valley fog haze
 * as the night HDRI path. `intensity` is weight × tuning (apply before fog mix);
 * keep `scene.backgroundIntensity = 1`.
 */
export function createAuroraBackgroundNode(uniforms: AuroraBackgroundUniforms) {
  const starRes = screenSize.x.max(float(1920));
  const sky = auroraSkyWgsl({
    rd: positionWorldDirection,
    t: time.mul(uniforms.timeScale),
    intensity: uniforms.intensity,
    auroraStrength: uniforms.auroraStrength,
    starStrength: uniforms.starStrength,
    starRes,
  });
  const fogU = getValleyFogUniforms();
  const nightVolume = getValleyFogSkyVolumeNode();
  if (!fogU || !nightVolume) {
    throw new Error('createAuroraBackgroundNode requires initValleyFog first (horizon haze).');
  }
  const hazedRgb = applySkyHorizonHaze(
    (sky as any).xyz,
    fogU.uFogColor as any,
    fogU.uSkyHorizonStrength,
    nightVolume,
    fogU.uSkyHorizonStart,
    fogU.uSkyHorizonEnd,
  );
  return vec4(hazedRgb, (sky as any).w);
}
