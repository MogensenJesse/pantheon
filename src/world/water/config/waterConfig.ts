// src/world/water/config/waterConfig.ts — WaterMesh construction from VISUAL.water
import { Color } from 'three';
import { VISUAL } from '../../../config/visualTuning';

const w = VISUAL.water;

/** Static construction params for the WaterMesh (uniforms tuned live via sync/dev panel). */
export const WATER_PARAMS = {
  /** Reflector render-target downscale (0.5 = half-res planar reflection). */
  resolutionScale: w.resolutionScale,
  /** UV repeat density of the normal map across world XZ. */
  size: w.size,
  /** Surface opacity (1 = fully opaque sheet; <1 adds transparency). */
  alpha: w.alpha,
} as const;

/** Night look: dark, calm, faint cool reflection. */
export const WATER_NIGHT = {
  waterColor: new Color(w.night.waterColor),
  sunColor: new Color(w.night.sunColor),
  distortionScale: w.distortionNight,
} as const;

/** Day look: deep blue-teal with bright sun glint and lively chop. */
export const WATER_DAY = {
  waterColor: new Color(w.day.waterColor),
  sunColor: new Color(w.day.sunColor),
  distortionScale: w.distortionDay,
} as const;
