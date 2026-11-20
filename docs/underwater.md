# Underwater

What the orb sees when it dips below the sea, and what the sea looks like from below. Cosmetic only: nothing here is saved and nothing changes the sim (the orb can already dip under; there is no swimming).

One switch, `VISUAL.underwater.enabled`, turns the whole volume off: every material then behaves as before it existed. The map editor never syncs the volume, so it stays off there.

## How it fits together

| Where | What |
| --- | --- |
| `src/config/visual/underwater.ts` | Every number: fog density and colours, caustics, shafts, the window, the screen ripple, and the `seabed` block (rocks, kelp, motes). Colour stops are per time of day like `water.stops` |
| `src/rendering/underwater/underwaterUniforms.ts` | The shared uniforms (`uSubmerge`, `uEnabled`, camera basis, sun direction in the water, ...); their numbers come from `VISUAL.underwater` |
| `underwaterSync.ts` | Once a frame from `core/gameTick.ts`: `syncUnderwater(...)` ramps the submerge value (over `submergeFadeM`) from the camera height against the water level (the flat mean level: the swell's crests are ignored here, see docs/water-waves.md), `mapEdgeFloorY` samples the map's edge for the horizon fill |
| `underwaterMath.ts` | Pure maths the shaders mirror: metres of water along a ray (`underwaterPathM`), the sun's apparent elevation from below (`apparentSunElevationDeg`). Covered by `npm run check:underwater` |
| `underwaterTsl.ts` | The shader pieces of the materials: water fog (`underwaterFogTsl`), caustics (`causticPatternTsl`, `underwaterCausticLightTsl`), the surface seen from below (`underwaterCeilingColorTsl`) |
| `underwaterShaftsTsl.ts` | Light shafts, a world-space raymarch drawn in a quarter-resolution render target in the post composite |
| `underwaterPostTsl.ts` | The pieces of the full-screen post pass: the view ray, the horizon fill (`underwaterVoidFillTsl`, `underwaterFillVoidTsl`) and the wobble of the whole view while the camera is under |
| `src/dev/panel/devPanelUnderwater.ts` | DEV panel section **Underwater** |

## The volume (phase A)

- **Fog.** The water is a third term of `scene.fogNode` (`atmosphereSystem.ts`): `1-(1-air)*(1-water)`, with the water term from the metres of water along each view ray. It is zero for any ray that never touches the water, so dry views are unchanged. The node is built once and never swapped (swapping recompiles every fogged material).
- **Caustics.** Added to sunlit terrain and map props below the water line (`biomeSplatShading.ts`, `mapPropShadingTsl.ts`), slanted along the refracted sun so the seabed and the shafts show one pattern.
- **The surface from below.** The water mesh is double-sided (`buildWaterMeshGraph.ts`); the back face shows a bright, widened window onto the sky and a water-coloured ceiling (`underwaterCeilingColorTsl`). The window's width is `window.edgeCos` (real water is 0.66, the game uses 0.35 on purpose).
- **Light shafts.** Raymarched in world space, so they stay put when the camera moves and end on the caustic patch they make. Cost is gated by `uShaftFade` (zero above water or with the sun down).
- **Horizon fill.** Far-plane pixels below the horizon become water, ramping to the terrain-edge colour so the map edge reads as endless water. Bloom reads the filled scene.
- **From above.** `water.shoreDepth` (absorption and refraction depth) lets the shallow seabed show through the surface.

## The sea floor (phase B)

All numbers are in `VISUAL.underwater.seabed`.

- **Rocks.** `world/underwater/seabedRocks.ts` (pure, node-runnable) turns the terrain into `prop` entities: one jittered candidate per `cellM` cell, kept where the water is `depthM` deep and the ground is no steeper than `maxSlope`, at most `maxCount` of them thinned evenly over the map, clear of landmarks (`landmarkClearM` times their scale). They go through the ordinary prop pipeline (`MapEntitySpawner.spawnMapEntities`), so they get instanced LODs, shadows, fog and caustics for free. Nothing is saved in the map: the same terrain always gives the same rocks. The stone keys (`rocks.keys`) are added to the play asset batch in `main.ts` via `SEABED_ROCK_KEYS`. Where `depthM` reaches the flat open-sea floor (20.5 m on island-mountain), half the rocks sit on that plain and the cap thins the shallows.
- **Kelp.** Grass blades, drawn by the ordinary grass system (`world/grass`), with the kelp numbers. The grass data map's alpha (it was an unused 255) holds a kelp weight 0..1, baked on the CPU with the rest of the map in `fillGrassDataTexture`: `world/grass/data/kelpCoverage.ts` (pure) gives it from the depth of the water over the floor (`depthM`, fading in over the first metre and out over the last two) and value noise at `patchM`, covering `patchShare` of the map. The compact kernel (`grassSsbo.ts`) lifts the grass weight there, drops the clumping, thins the blades to `density` through the annulus weight (so they keep their size) and gives them `heightM` (never higher than three quarters of the water over them, `uKelpWaterY`); the draw shader (`grassMaterial.ts`) makes them `widthMul` wider (the far ring keeps its width), swaying slowly along the wind's direction (`swayM`, `swayHz`) with `colorA`/`colorB`, and the scene fog tints them like the rest. The helpers are in `grass/tsl/grassKelpTsl.ts`; the uniforms `uKelp*` in `grassUniforms.ts`. The grass rings set how far it reaches and how dense it is (150 blades/m2 near the orb times `density`); the player's trail and the orb's rustle bend it like grass. Baked at load (and by the DEV grass re-bake), so the numbers are read at start-up only, and `enabled: false` leaves the alpha at 0.
- **Motes.** A fourth field of `life/particles/driftFields.ts`, drawn like the air's specks (`driftField.ts`). It hangs in a box centred on the camera's height (the floor can be far below) and takes a `ceilingY` (the water surface) so none shows above it. Its share is the submerge value, so it is invisible above water.

## Checks and DEV

- `npm run check:underwater`: the path maths, the sun angles, the rock placement (band of depth, determinism, cap, landmark clearance, slope) and the kelp weight (band of depth, patches).
- DEV panel **Underwater** writes into `VISUAL.underwater` itself (no second copy: `syncUnderwater` reads it every frame). It edits the volume's numbers live (fog, caustics, shafts, window, ripple, colours) and, in three groups after Colours, the sea floor: **Kelp** (density, blade lengths, width, sway, colours: pushed to the grass uniforms by `applyGrassKelpUniforms`, then a grass compact pass; blades regrow to the new length over a few seconds), **Kelp patches** (depth band, patch size and share: applied on release of the slider, then `refreshGrassDataMap` bakes the whole map again, about 0.7 s) and **Motes** (colours, opacity, size, box, wind, fall, wobble: read by the specks every frame). Reset underwater puts every edit back. Not live: the rocks (placed at load as map props: edit `seabed.rocks` and reload) and the motes' count and shape.
- In the Browser pane: `__pantheonTeleport(112, -34)` puts the orb in the bay east of the sunken temple (5 to 17 m deep on island-mountain); the pane must be shown (hidden it runs under 1 fps and the teleport barely takes effect).

## Not done or not checked

- Rocks and motes were looked at in play and approved. The kelp is looked at at midday in the bay only: its density, colour and sway are first guesses, and nothing has been measured for its cost.
- Only checked at midday; golden hour and night are not.
- No fish, no bubbles, no swimming.
- A GPU at the 16-texture limit has not been tried with the extra shader terms.
