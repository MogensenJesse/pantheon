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
// | Day aerial live strength  | —                | —                  | `aerialStrength × mix(aerialNightMul, 1, 1 − master)` |
// | `goldenHourT` / lighting  | sunrise (0)      | 58° peak (gh = 0)  | `sky.cycle.goldenHourPower` 1.4        |
//
// Horizon |viewDir.y| bands (0 = geometric horizon) stay two treatments:
// HDRI `horizonDim` 0.005→0.325 luma falloff; day haze `skyHorizon*` 0→0.36 aerial mix.
// Night sky/HDRI use the valley Y-slab volume (not the horizon band × master).

import { BELOW_HORIZON_ELEVATION_DEG } from './sky.ts';

const ATMOSPHERE_HAZE = {
  /**
   * Compile-time off switch (zeros night master + aerial at init/sync).
   * Live isolate is Perf → Disable valley fog / Disable distance haze.
   */
  enabled: true,
  /**
   * Night valley Beer-Lambert extinction (1/m) along the view ray through
   * `fogBase`..`fogTop`. Nearby ground stays readable; long looks cap at
   * `valleyRayMaxM`.
   */
  hazeDensity: 0.009,
  /** Cap on slab path length (m) so a long valley look is not a solid wall. */
  valleyRayMaxM: 420,
  /** Extra optical path (m) when the camera is under `fogTop` (near veil). */
  valleyAmbientM: 60,
  /**
   * Metres below `fogTop` for a quadratic density fade (1 at the core → 0 at the
   * ceiling). Under the ceiling (valley floor included, even below `fogBase`)
   * horizon and zenith use a height-weighted veil so sky and distant ground fill;
   * looking down still uses the path so nearby ground stays readable.
   */
  valleyEdgeFadeM: 56,
  /**
   * Surround/sky mix exponent on fade height (1 = tracks `valleyEdgeFadeM`,
   * >1 = obscuring lags the fade so the scene is not opaque while density is still low).
   */
  valleyObscurePower: 2,
  /**
   * Night valley × inland fade. Ocean is map-edge flood through wet cells;
   * inland lakes are wet but not ocean-connected so they stay in the pool.
   * `smoothstep(start, end, metres from ocean)` on the look XZ.
   */
  valleyInlandStartM: 40,
  valleyInlandEndM: 220,
  /** World Y — slab floor (keep at/below the water plane so lakes sit in the pool). */
  fogBase: 6,
  /**
   * World Y — night mist ceiling. Valleys fill; snow peaks stay above.
   * ~35 m is a puddle in this 350 m-relief world and will not read from a ridge.
   */
  fogTop: 88,
  /** Moonlit mist — must stay lighter than unlit terrain or the pool is invisible. */
  nightColor: '#3D4854',
  dayColor: '#d0dee7',
  /**
   * Day camera-XZ aerial (unless Disable distance haze / editor). Live strength is
   * `aerialStrength × mix(aerialNightMul, 1, 1 − night master)` so noon is full
   * wash and night keeps a faint distance veil under the valley pool.
   */
  aerialStartM: 200,
  aerialEndM: 560,
  aerialStrength: 0.75,
  /** Fraction of `aerialStrength` still applied at full night (0 = off, 1 = no fade). */
  aerialNightMul: 0.65,
  /**
   * SkyMesh / night HDRI stay `fog = false` (a far-clip dome would wash the whole sky).
   * Day: |viewDir.y| band × aerial (aerial eases to `aerialNightMul` at night).
   * Night: analytical valley-slab volume along the view ray (fills empty air when
   * the look crosses the layer; under the ceiling — including below `fogBase` —
   * zenith uses the surround veil so stars dim). Combined as `1-(1-day)*(1-night)`.
   */
  skyHorizonStart: 0,
  skyHorizonEnd: 0.36,
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
