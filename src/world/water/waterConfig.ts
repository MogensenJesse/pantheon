// src/world/water/waterConfig.ts — shared WaterMesh tunables + day/night presets
import { Color } from 'three';
import { VISUAL } from '../../config/visualTuning';

/** Static construction params for the WaterMesh (uniforms tuned live via sync/dev panel). */
export const WATER_PARAMS = {
  /** Reflector render-target downscale (0.5 = half-res planar reflection). */
  resolutionScale: VISUAL.water.resolutionScale,
  /** UV repeat density of the normal map across world XZ. */
  size: 4,
  /** Surface opacity (1 = fully opaque sheet; <1 adds transparency). */
  alpha: 1.0,
} as const;

/** Night look: dark, calm, faint cool reflection. */
export const WATER_NIGHT = {
  waterColor: new Color(0x050a14),
  sunColor: new Color(0x2a3344),
  distortionScale: 1.6,
} as const;

/** Day look: deep blue-teal with bright sun glint and lively chop. */
export const WATER_DAY = {
  waterColor: new Color(0x06283a),
  sunColor: new Color(0xfff3df),
  distortionScale: VISUAL.water.distortionDay,
} as const;
