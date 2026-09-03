// src/config/visual/atmosphere.ts — valley + distance haze
//
// Elevation envelopes (sun °) — same-shaped curves, different “noon”. Do not collapse them.
//
// | Signal                    | Full / start     | Clear / end        | Power / notes                          |
// |---------------------------|------------------|--------------------|----------------------------------------|
// | Cycle sunrise / night     | −5°              | —                  | `BELOW_HORIZON_ELEVATION_DEG`          |
// | HDRI fade                 | −5°              | 15°                | `sky.nightHdri.fadeElevation*`         |
// | God-ray shaft ramp        | −1°              | 8°                 | `godrays.ELEV_WEIGHT_*`                |
// | Cloud night palette fade  | sunrise          | sunrise + 6°       | overlay only; gold is `goldenHourT`    |
// | Haze night-valley master  | −5° (full)       | 30° (clear)        | `cyclePower` 1.4                       |
// | `goldenHourT` / lighting  | sunrise (0)      | 58° peak (gh = 0)  | `sky.cycle.goldenHourPower` 1.4        |
//
// Horizon |viewDir.y| bands (0 = geometric horizon) stay two treatments:
// HDRI `horizonDim` 0.005→0.325 luma falloff; day haze `skyHorizon*` 0→0.36 aerial mix.
// Night sky/HDRI use the valley Y-slab volume (not the horizon band × master).

import { BELOW_HORIZON_ELEVATION_DEG } from './sky.ts';

const ATMOSPHERE_HAZE = {
  enabled: true,
  /**
   * Night valley Beer-Lambert extinction (1/m) along the view ray through
   * `fogBase`..`fogTop`. Nearby ground stays readable; long looks cap at
   * `valleyRayMaxM`.
   */
  hazeDensity: 0.009,
  /** Cap on slab path length (m) so a long valley look is not a solid wall. */
  valleyRayMaxM: 420,
  /** Extra optical path (m) when the camera is inside the slab (near veil). */
  valleyAmbientM: 16,
  /**
   * Metres below `fogTop` for a quadratic density fade (1 at the core → 0 at the
   * ceiling). From inside, horizon and zenith use a height-weighted veil (sky
   * fills); looking down still uses the path so this cannot form a lid.
   */
  valleyEdgeFadeM: 56,
  /** World Y — slab floor (keep at/below the water plane so lakes sit in the pool). */
  fogBase: 6,
  /**
   * World Y — night mist ceiling. Valleys fill; snow peaks stay above.
   * ~35 m is a puddle in this 350 m-relief world and will not read from a ridge.
   */
  fogTop: 88,
  /** World Y — band top recedes to this on clear day (before cycle lift at dusk). */
  fogTopDay: 14,
  bandStrength: 1,
  /** Moonlit mist — must stay lighter than unlit terrain or the pool is invisible. */
  nightColor: '#73889c',
  dayColor: '#d0dee7',
  /**
   * Always-on camera-XZ aerial (unless Disable distance haze / editor). Same numbers as the
   * old terrain-only flatten so hills, trees, grass, and water wash together at noon.
   */
  aerialStartM: 120,
  aerialEndM: 560,
  aerialStrength: 0.75,
  /**
   * SkyMesh / night HDRI stay `fog = false` (a far-clip dome would wash the whole sky).
   * Day: |viewDir.y| band × aerial. Night: analytical valley-slab volume along the
   * view ray (fills empty air when the look crosses the layer; from inside the
   * valley, zenith uses the surround veil so stars dim). Combined as
   * `1-(1-day)*(1-night)`.
   */
  skyHorizonStart: 0,
  skyHorizonEnd: 0.36,
  /**
   * During HDRI fade, pull fog tint back toward night after the dayT lerp
   * (`hdriWeight × (1 − dayT) × this`). 0 = ignore HDRI; 1 = full pull.
   */
  hdriTintPull: 0.45,
  /** Sun elevation (°) at/above which night valley master ≈ 0 (clear midday). */
  clearElevationDeg: 30,
  /** Sun elevation (°) at/below which fog/haze master = 1 (night / deep dusk). */
  fullElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
  /** >1 keeps afternoons clearer longer before mist builds (1 = linear ramp). */
  cyclePower: 1.4,
} as const;

export const atmosphere = {
  haze: ATMOSPHERE_HAZE,
} as const;
