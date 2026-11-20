// src/config/visual/snow.ts — deep snow: the baked hull, the camera-following shell and the tracks the orb ploughs into it

export const snow = {
  /** Master switch. Off = the terrain's own snow colour only; no shell is drawn and no field pass runs. */
  enabled: false as boolean,
  /** Snow thickness (m) where the snow weight is 1. Baked: change it and rebake (DEV panel). */
  thicknessM: 0.8,
  /** Snow albedo (linear-ish white with a cold tint); the lighting is the terrain's own. */
  albedo: '#EEF3FA',
  /** Static snow bake over the whole map: metres per texel (2 m = 1024 x 1024 on the 2048 m world). Built once. */
  bake: { texelM: 2 },
  /**
   * Shell clipmap: `levels` rings of `cells` x `cells` cells, the finest `cellM` metres wide, each level twice the last
   * (9 levels from 0.125 m reach the whole 2 km map). Built once (reload to change).
   */
  shell: { levels: 9, cells: 64, cellM: 0.125 },
  /**
   * Tracks field: a toroidal window of `windowM` metres at `res` texels per side (6 cm texels). Built once. The window
   * centre stays put while the orb is within `hysteresisM` of it and then snaps to the `snapM` lattice, clearing the strip
   * that entered; `fieldFarM` must stay under `windowM / 2 - hysteresisM` or the clear shows.
   */
  field: { windowM: 64, res: 1024, snapM: 2, hysteresisM: 8 },
  /** Tracks shape the shell up to `fieldNearM`, fading out by `fieldFarM` (distance from the orb, m). */
  fieldNearM: 10,
  fieldFarM: 22,
  /**
   * Prints fill back in: depressions and berms fade with these time constants (s). Frame time is banked and applied in one
   * pass every `passS` seconds, because a half-float cannot hold a per-frame fade. Snowfall (`weatherLook.snow01`, 0..1)
   * speeds the fade up: at full snowfall time counts `1 + snowfallMul` times as fast.
   */
  refill: { depressionTauS: 600, bermTauS: 240, passS: 1, snowfallMul: 6 },
  /**
   * The orb in snow. Furrow: footprint half-extents (m), depth and berm height (m), and the stride (m) between stamps.
   * Wading: speed falls to `slowMul` once the snow is `slowDepthM` deep, and the orb rides `sinkShare` of the depth (up to
   * `sinkCapM`) below the snow surface, so the camera sinks with it. Read live by the player controller.
   */
  orb: {
    halfA: 0.35,
    halfB: 0.3,
    depthM: 0.35,
    bermM: 0.07,
    strideM: 0.25,
    slowMul: 0.45,
    slowDepthM: 0.8,
    sinkShare: 0.5,
    sinkCapM: 1,
  },
  /**
   * Grass under the snow: its density fades out between these snow depths (m) and is gone beyond, so blades only poke
   * through thin snow. Baked into the grass density map (changing it needs a re-bake: DEV panel).
   */
  grassKill: { startM: 0.08, endM: 0.35 },
  /** Stamp a furrow behind the orb while it moves. */
  autoTrail: true as boolean,
  /**
   * What the village's walkers leave: one print per `strideM` of walking, the feet `trackM` apart (alternating sides).
   * Half-extents and depth in metres; the snow there caps the depth. Only walkers within `field.windowM / 2 - field.hysteresisM`
   * of the orb print (farther, a print would wrap round the window), and none where the snow is thinner than 5 cm.
   */
  walkerTracks: true as boolean,
  brushes: {
    villager: { halfA: 0.2, halfB: 0.12, depthM: 0.22, bermM: 0.04, strideM: 0.6, trackM: 0.18 },
    sheep: { halfA: 0.1, halfB: 0.08, depthM: 0.15, bermM: 0.025, strideM: 0.4, trackM: 0.2 },
  },
} as const;
