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

/** Look stops sampled via todWeights (mutable Color instances for sync). */
export const WATER_LOOK_STOPS = {
  night: {
    waterColor: new Color(w.stops.night.waterColor),
    sunColor: new Color(w.stops.night.sunColor),
    distortionScale: w.stops.night.distortion,
    shallowColor: w.stops.night.shallowColor,
  },
  goldenHour: {
    waterColor: new Color(w.stops.goldenHour.waterColor),
    sunColor: new Color(w.stops.goldenHour.sunColor),
    distortionScale: w.stops.goldenHour.distortion,
    shallowColor: w.stops.goldenHour.shallowColor,
  },
  noon: {
    waterColor: new Color(w.stops.noon.waterColor),
    sunColor: new Color(w.stops.noon.sunColor),
    distortionScale: w.stops.noon.distortion,
    shallowColor: w.stops.noon.shallowColor,
  },
} as const;

/** @deprecated Prefer WATER_LOOK_STOPS — kept for callers still naming night/noon. */
export const WATER_NIGHT = WATER_LOOK_STOPS.night;
/** @deprecated Prefer WATER_LOOK_STOPS — kept for callers still naming night/noon. */
export const WATER_DAY = WATER_LOOK_STOPS.noon;
