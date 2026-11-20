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
  /** Things on and above the seabed: rocks (map props, placed at load), kelp (grass blades) and drifting motes. */
  seabed: {
    rocks: {
      /** Stone-pack props the rocks are drawn from (loaded with the map's other props). */
      keys: [
        'stone_small_1',
        'stone_small_2',
        'stone_small_3',
        'stone_mid_1',
        'stone_mid_2',
        'stone_mid_3',
        'stone_big_2',
      ],
      /** Rocks stand only where the water is this deep (m) and the ground is no steeper than `maxSlope` (rise over run). */
      depthM: [0.8, 25],
      maxSlope: 0.6,
      /** One candidate per cell of this size (m); at most `maxCount` rocks are kept, thinned evenly over the map. */
      cellM: 9,
      maxCount: 6000,
      /** Size multiplier range (log-uniform) and the share of a rock sunk into the sand. */
      scale: [0.5, 1.9],
      sink: 0.2,
      /** No rocks within this many metres (times the landmark's scale) of a landmark: the sunken temple has its own. */
      landmarkClearM: 22,
    },
    /** Kelp is grass: the grass system grows it where the data map's alpha says so (`world/grass/data/grassDataTexture.ts`), with these numbers. */
    kelp: {
      /** Share of the grass blades kept inside a kelp patch (the rings' own density times this: 150/m2 near the orb at 0.06 is 9/m2). */
      density: 0.06,
      /** Kelp grows where the water is this deep (m); it fades in over the first metre and out over the last two. */
      depthM: [1.5, 20],
      /** Blade length range (m); the grass bounds blades at its blade height times its max scale (2.25 m). A blade never reaches higher than three quarters of the water over it. */
      heightM: [1.2, 3],
      /** Blade width as a multiple of the grass's own (near and mid rings; the far ring keeps its own). */
      widthMul: 2.5,
      /** Metres of the blobs it grows in, and the share of the sea floor they cover. */
      patchM: 18,
      patchShare: 0.45,
      /** Sway at the tip (m) and its rate (Hz). */
      swayM: 0.5,
      swayHz: 0.2,
      colorA: '#2c441c',
      colorB: '#92ab3f',
    },
    /** Specks adrift in the water, drawn like the air's drifting specks (life/particles/driftField.ts). */
    motes: {
      count: 1400,
      boxM: 28,
      heightM: 10,
      shape: 'dot',
      additive: false,
      sizeM: [0.02, 0.05],
      colorA: '#cfe6e2',
      colorB: '#ffffff',
      hdr: 1,
      alpha: 0.45,
      windMps: 0.08,
      fallMps: 0.04,
      wobbleM: 0.6,
      wobbleHz: 0.12,
      spin: 0,
      blinkHz: 0,
      nightMul: 0.3,
      orbPullM: 0,
    },
  },
} as const;
