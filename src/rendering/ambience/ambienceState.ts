// src/rendering/ambience/ambienceState.ts — the world's ambient state as plain numbers (wind, time of day)
//
// Set once a frame by `ambienceView`; the systems that give the world life read it. It imports nothing, so any
// module can read it without a cycle. Rain is `weatherLook.rain01` (rendering/weather/weatherLook.ts).

export const ambience = {
  /** Unit direction the wind blows toward, in (x, z). */
  windDirX: -1,
  windDirZ: 0,
  /** Wind strength over calm: 1 in calm weather, more in a storm and just before rain. */
  windBoost: 1,
  /** Render-rate wind clock (s): it stops while the game is paused and a save keeps it. */
  windClock: 0,
  /** Night amount, 0..1, from the sun's height. */
  night01: 0,
  /** Golden hour (dusk and dawn) amount, 0..1. */
  golden01: 0,
};
