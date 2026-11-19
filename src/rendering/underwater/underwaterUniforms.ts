// src/rendering/underwater/underwaterUniforms.ts — live uniforms + mutable settings of the water volume
import { Color, Vector2, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

type UniformNode = any;

const U = VISUAL.underwater;

/** Mutable copy of the look defaults: the dev panel writes here, `syncUnderwater` pushes it to the GPU every frame. */
export interface UnderwaterSettings {
  enabled: boolean;
  density: number;
  deepM: number;
  stops: { [K in 'night' | 'goldenHour' | 'noon']: { shallow: string; deep: string } };
  causticStrength: number;
  causticScaleM: number;
  causticSpeed: number;
  causticWidth: number;
  causticFadeM: number;
  shaftStrength: number;
  windowGlow: number;
  windowEdgeCos: number;
  windowEdgeSoft: number;
  windowRipple: number;
  rippleAmp: number;
  rippleScale: number;
  rippleSpeed: number;
  orbTint: number;
}

export function defaultUnderwaterSettings(): UnderwaterSettings {
  return {
    enabled: U.enabled,
    density: U.density,
    deepM: U.deepM,
    stops: {
      night: { ...U.stops.night },
      goldenHour: { ...U.stops.goldenHour },
      noon: { ...U.stops.noon },
    },
    causticStrength: U.caustics.strength,
    causticScaleM: U.caustics.scaleM,
    causticSpeed: U.caustics.speed,
    causticWidth: U.caustics.width,
    causticFadeM: U.caustics.fadeM,
    shaftStrength: U.shafts.strength,
    windowGlow: U.window.glow,
    windowEdgeCos: U.window.edgeCos,
    windowEdgeSoft: U.window.edgeSoft,
    windowRipple: U.window.ripple,
    rippleAmp: U.ripple.amplitude,
    rippleScale: U.ripple.wavelength,
    rippleSpeed: U.ripple.speed,
    orbTint: U.orbTint,
  };
}

export const underwaterSettings: UnderwaterSettings = defaultUnderwaterSettings();

export function resetUnderwaterSettings(): void {
  Object.assign(underwaterSettings, defaultUnderwaterSettings());
}

export interface UnderwaterUniforms {
  /** 0 leaves every material as it was; 1 = the volume is on. */
  uEnabled: UniformNode;
  uDensity: UniformNode;
  uDeepM: UniformNode;
  uShallowColor: UniformNode;
  uDeepColor: UniformNode;
  uCausticStrength: UniformNode;
  uCausticScaleM: UniformNode;
  uCausticSpeed: UniformNode;
  uCausticWidth: UniformNode;
  uCausticFadeM: UniformNode;
  uWindowGlow: UniformNode;
  uWindowEdgeCos: UniformNode;
  uWindowEdgeSoft: UniformNode;
  uWindowRipple: UniformNode;
  /** Screen wobble under water: peak UV offset, UV wavelength, speed. */
  uRippleAmp: UniformNode;
  uRippleScale: UniformNode;
  uRippleSpeed: UniformNode;
  /** Share of the fog colour mixed into the orb (unlit, fog = false) in proportion to the water in front of it. */
  uOrbTint: UniformNode;
  /** Light shafts: brightness, and how much of them shows (0 = none: above water, sun down). */
  uShaftStrength: UniformNode;
  uShaftFade: UniformNode;
  /**
   * Unit vector from the water towards the sun as it shows from under the surface (its light bends towards the vertical,
   * and the surface window stretches that further: see `apparentSunElevationDeg`). Shared by the shafts and the floor
   * caustics, so a beam lands on the caustic patch under it. Updated every frame, above water too.
   */
  uSunDirWater: UniformNode;
  /**
   * The game camera for the post pass, whose own camera nodes are the full-screen quad's: world position, right/up/forward
   * axes, tangents of the half field of view (x, y) and near/far planes (to read the depth buffer).
   */
  uCamPos: UniformNode;
  uCamRight: UniformNode;
  uCamUp: UniformNode;
  uCamFwd: UniformNode;
  uCamTan: UniformNode;
  uCameraNear: UniformNode;
  uCameraFar: UniformNode;
  /** World Y of the sea floor where the terrain mesh stops at the map edge: the void beyond it is filled as water down to there. */
  uEdgeFloorY: UniformNode;
  /** 0..1 sunlight, for the bright window and the caustics' tint. */
  uDaylight: UniformNode;
  /** Seconds on the caustic clock (advances with frame time; not TSL `time`, which the tide uses). */
  uClock: UniformNode;
  /** 0..1, smoothed: how far the camera is under the surface. Drives the orb tint and anything CPU-side. */
  uSubmerge: UniformNode;
}

export const underwaterUniforms: UnderwaterUniforms = {
  // Off until the game loop syncs it: the map editor never does, so its sea floor stays untinted.
  uEnabled: uniform(0),
  uDensity: uniform(U.density),
  uDeepM: uniform(U.deepM),
  uShallowColor: uniform(new Color(U.stops.noon.shallow)),
  uDeepColor: uniform(new Color(U.stops.noon.deep)),
  uCausticStrength: uniform(U.caustics.strength),
  uCausticScaleM: uniform(U.caustics.scaleM),
  uCausticSpeed: uniform(U.caustics.speed),
  uCausticWidth: uniform(U.caustics.width),
  uCausticFadeM: uniform(U.caustics.fadeM),
  uWindowGlow: uniform(U.window.glow),
  uWindowEdgeCos: uniform(U.window.edgeCos),
  uWindowEdgeSoft: uniform(U.window.edgeSoft),
  uWindowRipple: uniform(U.window.ripple),
  uRippleAmp: uniform(U.ripple.amplitude),
  uRippleScale: uniform(U.ripple.wavelength),
  uRippleSpeed: uniform(U.ripple.speed),
  uOrbTint: uniform(U.orbTint),
  uShaftStrength: uniform(U.shafts.strength),
  uShaftFade: uniform(0),
  uSunDirWater: uniform(new Vector3(0, 1, 0)),
  uCamPos: uniform(new Vector3()),
  uCamRight: uniform(new Vector3(1, 0, 0)),
  uCamUp: uniform(new Vector3(0, 1, 0)),
  uCamFwd: uniform(new Vector3(0, 0, -1)),
  uCamTan: uniform(new Vector2(1, 1)),
  uCameraNear: uniform(0.1),
  uCameraFar: uniform(1000),
  uEdgeFloorY: uniform(-20),
  uDaylight: uniform(1),
  uClock: uniform(0),
  uSubmerge: uniform(0),
};
