# Weather (M8)

`src/world/weather/weather.ts` (pure, explicit `.ts` imports) + `src/config/weather.ts` (`WEATHER`). The look is in `src/rendering/weather/`.

## Storm fronts
About one game day in `1 / CHANCE_PER_DAY` (a hash of the day and the map's seed; the first `CALM_DAYS` are calm) brings a front: a disc of rain `RADIUS_M` in radius that crosses the map at `SPEED_MPS` on the cloud wind's heading plus up to `HEADING_JITTER_DEG`, its path missing the anchor (the village, or the map's middle) by up to `LATERAL_MAX` of the radius, so the village is always hit when a front comes (at least `PEAK.MIN` at the heart). Rain falls inside it and fades over `EDGE_M`.

Measured: rain over 0.3 at the village lasts a median of 10 min (5 to 17), the ramp is about 60 s from 10% to 90%, nothing jumps by more than 0.02 a second.

## Rules
- **Rain is local**: `weather.rainAt(x, z, clockS)` answers for any place, so the village feels the rain where it stands and the camera can feel another.
- **Nothing is stored** for the natural weather: it is a pure function of the game clock `elapsed` (which a save keeps) and the map, so a loaded game continues the same sky.
- `createWeather({ anchorX, anchorZ, seed, windDirectionDeg })` is made in `main.ts` and passed to `initVillageSystem`; `VillageSystem.update(dt, playerPosition, clockS)` turns it into `VillageSimInputs.rain01` (**no weather in Phase 0**: `state.phase < 1` gives 0; DEV `villageDevState.rain01` overrides). `frontsAt(clockS)`, `frontOfDay(day)` serve tools and the sky.
- **Hooks for the powers**: `addFront(front)` (a storm called up) and `clearSkies(zone)` (a hole in the rain for a time); the Call rain and Clear skies powers use them, and `serialize(clockS)`/`restore` keep them in the save (`ProfileState.powers.weather`, spent ones dropped).
- `stepWetness(wet, rain, dt)`: wet ground soaks in `WET.RISE_S` of full rain and dries in `WET.DRY_S`.
- **Effects on the sim**: shelter (see [routine](routine.md)), the forest's regrowth boost (`FOREST.RAIN_BOOST`) and **fields grow `FIELDS.RAIN_BOOST` faster at full rain, linear in the rain**.

## How it looks (M8b)
- `weather.overcastAt(x, z, clockS)`: the sky closes in `LOOK.OVERCAST_LEAD_M` before the rain and is full where it rains; clear-skies holes open it too.
- `createWeatherView` (`rendering/weather/weatherView.ts`, made in `main.ts`, run from `gameTick.render` before the lighting is pushed) reads the weather at the **camera**, keeps the wet ground (`stepWetness`) and writes `weatherLook` (`rain01`, `overcast01`, `wetness01`, plain numbers, 0 in clear weather) and the `uWetness` uniform (`rendering/tsl/wetLookTsl.ts`); DEV `villageDevState.rain01` forces it for the camera too; no weather in Phase 0.
- Readers: `lightingCurves.applyWorldLightingFromElevation` (sun, ambient and day factor lose light under overcast: `LOOK.SUN_DIM`, `AMBIENT_DIM`, `DAYLIGHT_DIM`), `cloudColorTsl.sampleCloudLit` (clouds lose light and tint and gain opacity), `applyWetLookTsl` (darker by `WET_DARKEN`, richer by `WET_SATURATE`) at the end of the terrain splat shading, the map-prop materials (so the village's buildings too) and the grass blades; villagers and the village dressing are not wet-looking.
- `rainStreaks.ts`: one `InstancedMesh` of `LOOK.STREAKS.COUNT` `SpriteNodeMaterial` streaks animated entirely in the shader (a box in front of the camera, a lattice fixed in the world, faded at the box rim and near the camera), `castShadow` off, hidden below rain 0.01.
- Not built: the dark storm deck of extra clouds (the existing clouds go grey and thick instead), wet specular.

## DEV
`__pantheonWeather` (`dev/runtime/weatherProbe.ts`: `rain(x?, z?)`, `fronts()`, `schedule(days)`, `callStorm(radius?, x?, z?, peak?)`, `clearSkies(seconds?, radius?, x?, z?)`, `look()`, `reset()`, `forceVillageRain(r | null)`) and `__pantheonVillage.setRain(r | null)`, `rain()`; the dev panel's "Force rain / follow weather" button and rain readout.

## Check
`npm run check:weather` (`scripts/checks/weather/weather-check.ts`: the hash, purity, the calm start, the share of days with a front, every front reaching the village, duration and ramp and smoothness, locality, the hooks, wet ground); `check:village-routine` covers the field boost. Fronts are not derived from the visible clouds because the map's real clusters only pass over a point as a short shower every few minutes (measured while building M8).
