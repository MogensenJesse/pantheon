// src/config/visual/godrays.ts — screen-space occlusion light shafts

/** Shader loop cap — keep the Samples slider max in sync. */
export const GODRAYS_MAX_SAMPLES = 128;

export const godrays = {
  /** Radial taps toward the sun (shader loop capped at GODRAYS_MAX_SAMPLES). */
  SAMPLES: 128,
  /**
   * Per-sample energy keep (GPU Gems decay). Closer to 1 = longer shafts
   * from the sun disc; too low kills samples before they reach the sun.
   */
  DECAY: 0.94,
  /** Step length along pixel→sun (1 = walk the full screen vector in SAMPLES taps). */
  DENSITY: 3,
  /** Brightness of the accumulated occlusion scatter (before composite weight). */
  EXPOSURE: 0.4,
  /** Composite add multiplier (scaled by sun intensity × elevation ramp × cohesion). */
  WEIGHT_MUL: 0.55,
  /**
   * Smoothstep on raw sun elevation (°) — shafts fade in as the disk clears the
   * geometric horizon. Night is already gated by sun intensity 0.
   */
  ELEV_WEIGHT_START_DEG: -1,
  ELEV_WEIGHT_END_DEG: 8,
  TINT_R: 1.05,
  TINT_G: 0.92,
  TINT_B: 0.72,
  /**
   * Sky vs geometry from *linear* view distance (fraction of camera.far).
   * Buffer depth packs distant trees next to the far plane, so they were treated
   * as sky and did not cut shafts. Any surface short of the cleared far plane occludes.
   */
  DEPTH_START: 0.9,
  DEPTH_END: 0.995,
  /**
   * Aspect-corrected UV radius of the sun emitter (screen heights).
   * Core is the bright disc; radius is the corona that still emits into the scatter.
   */
  SUN_CORE: 0.02,
  SUN_RADIUS: 0.18,
  /** Fade shafts as the sun NDC leaves the screen (0 at |ndc| = 1, 0 at 1 + this). */
  OFFSCREEN_FADE: 0.5,
} as const;
