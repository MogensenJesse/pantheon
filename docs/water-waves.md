# Waves

Two kinds, both cosmetic and both driven by the wind: the **swell** (long waves that lift the open sea, always travelling toward the nearest shore) and the **shore waves** (foam fronts that roll in, a **swash** that moves the water's edge up and down the beach, and the wet sand it leaves).

## How it fits together

| Where | What |
| --- | --- |
| `src/config/visual/water.ts` `waves` | Every number: `swell` (heights, speed, crests, shoaling, the four components, whitecaps), `shore` (period, break line, trail, the swash, wet sand, foam colour), `lake` (how calm enclosed water is) and `mesh` (ring growth, edge lift). Edits to the file restart vite; the DEV section edits the same object live |
| `src/world/water/waves/waveMath.ts` | Pure maths: the swell table (`swellTable`), height at a point (`swellHeightAt`), `openSeaGrow`, `swellMaxHeightM`, `lakeMul`, `effectiveShoalDepthM`, `waveEnergy`, `whitecapStrength`, and the shore curves (`shoreDerived`, `shoreFrontM`, `edgePulse`, `swashProfile`, `runUpM`, `wetHeightM`). Covered by `npm run check:water-waves` |
| `waves/shoreFieldBake.ts`, `waves/shoreFieldTexture.ts` | The baked shore field (distance to the nearest shore + the way to it), pure bake and data texture. Built by `MapTerrainBuilder` next to the ocean inland mask (about 100 ms, 4 MB) |
| `tsl/waterWavesTsl.ts` | The swell in the vertex shader (Gerstner sum of four, phase from the shore field) and the whitecaps |
| `tsl/waterRunUpTsl.ts` | The swash: `waterRunUpTsl` (the sea's vertical offset at the shore), the two front phases, the pulses |
| `tsl/waterFoamTsl.ts` | The shore foam on the water (`waterSurfaceFoamMaskTsl`) |
| `src/world/terrain/material/waterWetnessTsl.ts` | Wet sand on the terrain (`applyWaterTerrainWetnessTsl`, called from `biomeSplatShading.ts`) |
| `mesh/waterDiscGeometry.ts` | The sea as a disc of rings, finest at its centre |
| `sync/syncWaterWaveUniforms.ts` | Once a frame (from `syncPantheonWater`): wind boost to energy, config to uniforms, `currentWaveEnergy()`, `currentSwashPeakM()` |
| `sync/syncWaterWaves.ts` | `followCameraWithWater`: the disc follows the camera in x and z (called from `core/gameTick.ts`) |
| `material/waterWaveUniforms.ts` | The shared uniforms (`waterWaveUniforms`, with `swell` for the vertex side and `uShoreField`) |
| `src/dev/panel/devPanelWaves.ts` | DEV section **Waves** |

## Wind coupling

`energy = (uWindBoost - 1) / (fullEnergyBoost - 1)`, clamped to 0..1: 0 in calm weather, 1 in a full storm (the boost is smoothed over 6 s by the ambience, so the sea builds and settles gradually). The swell height goes from `calmHeightM` to `stormHeightM`, whitecaps start once `energyFrom` is passed, and the shore waves widen (`stormMul`, which also raises the swash) and strengthen (`calmShare` up to 1).

## The swell

- A Gerstner sum of four components (`swell.components`: wavelength, share of the height). The phase runs on the wind clock (`uWindClock`), so the sea stops with the game.
- **It always travels toward the nearest shore.** There is no heading in the config. The phase of every component is `-k × distance to the shore - ω t`, so crests run parallel to the coast and bend around the island; the horizontal shift and the slope follow the gradient of that distance. The distance comes from a baked field (below). Where two coasts are equally near the gradient shortens, so the swell calms there (waves meeting).
- It dies out in shallow water and hands over to the shore waves. The depth over which it does (`effectiveShoalDepthM`) is `shoalDepthM` or **2.5 swell heights, whichever is more**: a smoothstep climbs at most 1.5 times its height per depth, so the trough can never take more than 60 % of the water above a point. **The swell never moves the waterline** (the check proves it); only the swash does. That also lets the terrain's wet sand and caustics ignore the swell. Outside the map the depth is the open-ocean depth: full swell.
- Each component fades out with distance from the camera (`fadeFromWavelengths` to `fadeToWavelengths`), because the mesh is too coarse for it beyond. The mesh cell is `ringGrowth` times the distance, so it passes a third of a wavelength at `wavelength / (3 × ringGrowth)`; the check requires at least half of the wave to have faded by then. Change `mesh.ringGrowth` or the fade distances and the check says whether they still fit.
- The ripple normal map is kept; the swell's slope tilts `surfaceNormal` on top, so reflection, refraction, specular and the surface seen from below all follow the waves.
- **The open sea is taller than the coast.** `swell.openSea` (`gain`, `fromM`, `toM`, live in DEV > Waves > Swell): the height is 1 x within `fromM` of the nearest land and `gain` x from `toM` out, a smoothstep between (`openSeaGrow`, from the same shore-field distance as the phase). The shoaling depth grows with it, so the "water over a point is at least 40 % of its depth" invariant holds for any gain (the check proves it); near-land waves are unchanged. `swellMaxHeightM` is the tallest the sea can get (`swellTotalHeightM x max(1, gain)`) and the bound the checks use. The numbers are in the config; on the real map the sea is deeper than 13 m beyond 100 m from land, so the shoaling does not limit the swell out there.
- The mirror plane's headroom (`surfaceHeadroomM` in `syncPantheonWater.ts`) is the near-land swell's current total height plus the swash peak plus `mesh.edgeLiftM`, so the surface never crosses the plane (that was the waterline seam). It leaves out the open-sea gain on purpose: the shore is where the seam shows, and a plane lifted for the open-sea waves would sit metres over the water at the beach.
- **The mirror plane never rises above the eye.** The reflector clears its image while the camera is below its mirror plane, so a lifted plane killed the reflection for a low camera (standing at the water, looking at the horizon). `syncPantheonWater` takes `cameraAboveWaterM` (the camera's height over the mean level; `gameTick` passes it) and puts the plane at `min(lifted height, camera height - EYE_OVER_PLANE_M)`, never below the mean level for that reason alone. The price: with a camera lower than the lifted plane (a wader, about 2 m over the water) the plane sits under the swell crests near the camera, so the waterline seam can show again there; the reflection is kept.
- **Twin rule:** `swellHeightAt` is the CPU mirror of `swellAtTsl` (without the horizontal shift, a few centimetres); it takes the distance to the shore, which `shoreDistanceAt(field, worldSize, x, z)` gives on the CPU. Anything that floats on the sea later reads the height from them.

### The shore field

`bakeShoreField` turns the height grid into a 513 x 513 texture (4 m cells on the 2048 m map): RGBA float, R = signed distance to the nearest land (positive on the sea; land is any height at or above the water level in the texel's footprint), GB = the way to the shore (the gradient of that distance, about unit length), A = the lake share (next section). It is an exact Euclidean distance transform, once for the sea and once for the land (so the field is smooth through the coast), then a short box blur that rounds the creases between coasts. Beyond the map edge the distance keeps growing from the edge texel (`shoreFieldTsl`). Water level changes in the editor re-bake in place (75 to 115 ms warm on the real map). The water's vertex stage samples it for the swell; the lake share is also read by the water fragment and by the terrain's wet sand (an explicit-level fetch: one more texture binding in the terrain shader, which compiled fine; the budget was not measured).

## Enclosed water (lakes)

Water the sea cannot reach is calmer. The shore field's alpha is the **lake share**: 0 on the open sea, 1 in enclosed water. `shoreFieldBake.ts` flood-fills the water cells connected (4-way) to the field's border as the sea; every other water cell is a lake; land takes the value of the nearest water (a lake's bank reads the lake, the sea's coast the sea); then the same box blur as the distance. `lakeShareAt` is the CPU twin, `lakeShareTsl(worldXZ)` the shader read (explicit mip level, so any branch may call it).

`waves.lake` (live, DEV > Waves > Enclosed water) holds shares of the open-sea value (1 = no difference, 0 = none): `swellShare` (the swell's height; the whitecaps follow because the crest share is scaled too, so a calm lake never breaks), `swashShare` (swash height and reach, so the water's edge, the caustics, the underwater pass and the wet sand all shrink together and stay one line), `foamShare` (foam strength and the width of the breaker zone) and `rippleShare` (the fine normal-map ripples, which also lowers the reflection distortion: a clearer mirror). The shoaling depth stays the open sea's (`swellHeightAt` takes `calm` for the same reason).

Limits: "enclosed" means no water path to the map border at the bake's resolution, so a channel narrower than a cell (4 m) closes a lake off, and a map with no water on its border counts all its water as enclosed. The share is the same for every lake (not by size or fetch: a big lake gets no more waves than a pond). The ripples' scroll speed, the mirror plane's headroom and the underwater fog are the sea's. On the real map there is one lake, about 10 500 m² centred at (99, -63): the underwater "bay".

## The mesh

A log-polar disc: the ring radius grows by `ringGrowth` per ring out to `fineToM`, then by `coarseGrowth` to the rim, so the cell is a fixed share of the distance. About 32 000 vertices. It follows the camera (`followCameraWithWater`), so its rim is `waterRadius + 4096` m to stay past the edge fade from anywhere on the map; the waves are anchored in the world, not to the mesh.

**Edge lift (`mesh.edgeLiftM`, live, DEV > Waves > Waterline edge).** Over the shallows the vertices ride this far (fading out between 0.5 and 1.5 m depth) above the exact surface the fragment works out. The fragment's opacity is 0 on land, so the lift is invisible; what it does is make the visible waterline the shader's world-anchored edge instead of the cut of the sliding grid through the terrain (which could wobble as the camera moves). The shadow opacity boost is scaled by the land mask so the lifted sheet shows no dark band at the edge. The wobble could not be reproduced in the test pane (sub-pixel with and without the lift); in the game the lift looked better, so it stays (compare with 0 in the DEV panel).

## The shore waves and the swash

Two fronts run at once, half a cycle apart (`periodS`). Each is born `breakDistM` out, runs toward the waterline (fast at first and slowing) and merges into it when its uprush starts; seaward of a front the water carries a foam trail (`trailM`). The fronts are bent along the beach by noise (`alongShoreM`, `wobble`), so they are never straight lines. The phase is a function of world x, z and the wind clock only, so the water and the terrain agree on it.

**The water's edge moves.** When a front arrives, the sea at the shore rises (the **uprush**, `riseShare` of a cycle), then falls back (the **backwash**, `backwashShare`) down to `recedeShare` x `swashHeightM` below the mean level before the next front. `waterRunUpTsl(worldXZ, depthM)` is that vertical offset: `swashHeightM` x (pulse - `recedeShare`) x lobes x a profile that is 1 at the waterline, 0 deeper than 1.5 swash heights and on ground higher than the swash can climb. The water mesh lifts by it (vertex) and the fragment evaluates the same offset exactly, so the visible edge climbs the sand and retreats. It is a **height**, so on a flat beach it is a long way and on a steep one a short way (swash height / slope), like a real beach. Lobes (`lobeM`, `lobeShare`) make the edge bulge and pull back in patches, so it is not a straight line.

**Wet sand** is measured in height above the mean level: wet up to the highest recent swash (`wetHeightM`: the uprush lifts it, then it dries over `dryShare` of the next cycle), never below `dampHeightM`. Underwater sand is not darkened. **Moist sand** is a second, lighter band (`moistDarken`) much wider than the wet one: sand near the sea is always a little wet, even where no wave reaches. It fades out `moistWidthM` metres (horizontal, measured like the foam from the waterline, so it is the same width on a flat beach and a steep one) inland, with lobed edge, but never climbs above `moistHeightM` over the mean level (a thin band on steep ground, and the terrain shader only does the slope taps for fragments below that height). It is static: it does not follow the swash. **Foam** is measured from the real waterline: the fringe hugs the moving edge and is strongest while the water climbs.

## One waterline

The foam, the wet sand, the caustics and the water's own edge all start on the same line, because they all measure from one surface: the mean level plus the swell plus the swash.

- **Surface.** On the water: the swell is the vertex shader's height (the fourth component of `swellVary`), the swash is evaluated exactly in the fragment (`waterRunUpTsl` from the mean depth); the vertices also lift by the swash so the mesh really reaches the sand. On terrain and props only the swash is evaluated, `waterRunUpTsl(worldXZ, depthAboveMean)`: no texture, cheap, and the same function (the swell is a fraction of the depth there and never moves the edge).
- **Shore distance.** `shoreDistanceAtM(worldXZ, surfaceOffset)` in `tsl/waterShorelineFieldTsl.ts` is `shoreDistM` against `uWaterY + surfaceOffset`. The water fragment and the terrain's wet sand both call it.
- **Depth.** The swell's shoaling in the vertex stage uses the same chiseled terrain height as the terrain shaders (`chiseledWorldYAtWorldXZ`), so everything reads the same ground.
- **Caustics** (`rendering/underwater/underwaterTsl.ts`): the surface is `uWaterY` plus the swash, and `inWater` fades in over the first 2 cm of depth, so they begin on the waterline.
- **The water's own edge** (`waterLandMask` in `tsl/waterDepthTsl.ts`): its opacity and its refraction/tint weight ramp over `shoreDepth.coastFadeM` of horizontal distance from the waterline. Keep it small (0.5 m). A wide fade (it was 4.5 m) leaves a band of clear water a few metres wide: its caustics and foam are real, but the eye reads that band as dry sand, so the caustics seem to run past the water and the foam to float on sand.
- Left out on purpose: the horizontal Gerstner shift (a few cm at the edge).

## Underwater and the map editor

- The fog and the shafts treat the surface as the flat mean plane (`uWaterY`) and `submergeAmount` uses it too, so the volume stays consistent with itself; near the surface in a storm the camera can be a crest's height off the true surface. The surface from below is the real displaced mesh.
- The map editor sets the swell height and the shore waves to zero (`initWaterWaveEditorPreview`): a static level. It never syncs the waves.

## Not done

- The swell's speed does not slow in shallow water, and the swell is not refracted beyond turning toward the nearest shore.
- The swash raises the sea only within 1.5 swash heights of depth and does not push water over flat ground beyond the height it can climb.
- Nothing floats on the swell or the swash yet.
- The open-sea gain grows with the distance to land only: it ignores depth, fetch and the wind direction, and a storm just multiplies it (not measured: the GPU cost of the extra smoothstep). At the committed gain the crests fold over in a full storm (the check "the crests do not fold over" fails): lower `steepness`, `stormHeightM` or the gain, or cap the horizontal shift in the shader.
