// src/config/visual/underwater.ts — the water volume: fog on the view ray, depth colour, caustics, the surface seen from below

export const underwater = {
  /** Master switch: 0 leaves every material exactly as it was before the volume existed. */
  enabled: true,
  /** Fog density (1/m) along the part of a view ray that is under the surface. Looking straight down at 8 m: exp(-0.08 * 8) = 53 % left. */
  density: 0.08,
  /** Depth (m) where the fog colour has gone from `shallow` to `deep` (e-fold). */
  deepM: 9,
  /** Fog colour at the surface (shallow) and far down (deep), sampled through todWeights like the water's own stops. */
  stops: {
    night: { shallow: '#0a2230', deep: '#030a12' },
    goldenHour: { shallow: '#2f7f94', deep: '#10304f' },
    noon: { shallow: '#3fb0c2', deep: '#0b3a66' },
  },
  caustics: {
    /** Brightness added to sunlit ground under the surface (0 = off). */
    strength: 3,
    /** World metres per pattern cell (the pattern never repeats; this is its feature size). */
    scaleM: 3.4,
    speed: 0.35,
    /** 0 = thin lines, 1 = fat bands (the painterly pass smears thin lines away). */
    width: 0.55,
    /** Depth (m) over which the pattern fades out. */
    fadeM: 16,
  },
  /** Light shafts: sunlight through the rippled surface, seen in the water along the sun's refracted direction, while the camera is under. */
  shafts: {
    /** Brightness (0 = off). */
    strength: 2.5,
  },
  /** The surface seen from below. */
  window: {
    /** Brightness of the bright window onto the sky (and of the water ceiling beyond it, as a share of the fog colour). */
    glow: 1.75,
    /** cos of the window's half angle. Real water is 48.6 degrees -> 0.66; wider on purpose so more of the world above shows. */
    edgeCos: 0.35,
    /** Softness of the window's rim, in cos units. */
    edgeSoft: 0.15,
    /** How much the surface ripples bend the refracted view (0 = flat surface, 1 = the water's own waves). */
    ripple: 1,
  },
  /** Screen wobble while the camera is under: the whole view is bent by the moving water. */
  ripple: {
    /** Peak UV offset (0.004 is about 5 px at 1080p). */
    amplitude: 0.0025,
    /** UV distance between wave crests. */
    wavelength: 0.07,
    speed: 2,
  },
  /** Share of the fog colour mixed into the orb and its sparkles while the camera is under (they are unlit, fog = false). */
  orbTint: 0.45,
  /** Camera depth (m) over which the submerged state fades in once the camera passes the surface. */
  submergeFadeM: 0.25,
} as const;
