# Ambient life: wind, trees, drifting things, animals and the places of power

What makes the world feel alive without touching the game rules: one wind that trees, grass, flowers and smoke share, leaves and fireflies on that wind, sheep and hens in the village, birds over the woods, and a small cloud of life at each place of power that grows as the story goes on. The index is the layout table in `AGENTS.md`; the look and the numbers are in `src/config/visual/life.ts` (`VISUAL.life`) and `VISUAL.props.sway`.

## Rules that hold for all of it

- **Cosmetic, never saved.** Nothing here is in the save. A load works every level out again from the landmark state, the quests and the clocks, and starts everything at that level, so nothing fades in on a load.
- **The village sim is only read.** The animals look at the village; they never change it, so the village goldens (`npm run check:village-golden`) do not move.
- **Creatures notice the orb only from Phase 1** (`state.phase >= 1`, `creatureState.notices`). Plants react to the orb always. Phase 0 keeps its rule that no living creature perceives the orb.
- **No GPU needed to prove the maths.** Every shader has a pure CPU twin (`.ts` imports, node-runnable) that a check exercises; the twins must stay in step with the shaders. What a screen shows still needs a real GPU (the checklist is in `story-mechanics/PHASE_0_TODO.md`).
- **Nothing is compiled late.** Every mesh is made before the pipeline warm-up (`bootstrap/shadowWarmup.ts`) and is visible from the first frame at a density or level of 0, which draws nothing. Never toggle `visible` for these.

## 1. The one wind

| Piece | Where |
|---|---|
| The numbers (direction, boost, clock, night, golden hour) | `src/rendering/ambience/ambienceState.ts` (`ambience`, a leaf with no imports; rain is `weatherLook.rain01`) |
| The shader side | `src/rendering/ambience/windUniforms.ts` (`uWindDirection`, `uWindClock`, `uWindBoost`); the grass system reuses these nodes |
| Written once a frame | `src/rendering/ambience/ambienceView.ts`, from `gameTick.render` after the weather look and the sun's height are known |
| The rules | `src/life/windGust.ts` (pure): `windHeading`, `windBoostTarget`, `preRainGust`, `followTarget` |

- **Direction** is the cloud heading (`getLiveCloudSettings().windDirectionDeg`): the wind blows toward `(sin θ, cos θ)` in (x, z), so 270° is toward -x. The storm fronts are deterministic from the same heading, so grass, flowers, trees, smoke, leaves and clouds all go the way the weather goes. This flipped the grass, flower and smoke lean from east to west.
- **Boost** (`uWindBoost`, `ambience.windBoost`) is 1 in calm weather and `1 + STORM_GAIN * rain + PRE_RAIN_GAIN * pre-rain gust` otherwise. The pre-rain gust looks `PRE_RAIN_LEAD_S` of game time ahead (`weather.rainAt(x, z, clock + lead) - rainAt(x, z, clock)`), so the trees and grass pick up shortly before a front arrives. The boost follows its target with `SMOOTH_S`. No weather in Phase 0: the boost stays 1.
- **`uWindClock`** is a render-rate clock: smooth, stopped while the game is paused, kept by a save, and written on maps that have no grass. Use it, never TSL `time`, in anything that should freeze with the game.
- Grass and flowers multiply their lean by `uWindBoost` (a separate multiplier, because the DEV grass panel overwrites `uWindStrength`).

## 2. Trees in the wind

`src/world/mapProps/sway/treeSway.ts` (pure twin) and `tsl/propSwayTsl.ts` (shader), the profile per prop key in `sway/treeSwayProfile.ts`, uniforms in `config/propSwayUniforms.ts`, tuning in `VISUAL.props.sway`.

- A tree leans along the wind by `lean × height`, weighted by `(height share) ^ heightPower`, so the trunk stays stiff and the crown moves. The lean is a gust wave that travels along the wind (`waveLengthM`, `periodS`; a broad slow wave and a faster narrow one) plus a smaller wobble across the wind. Near trees (lod0) also flutter at the crown, and the flutter rises near the orb (`orbRadiusM`, `orbGain`; plants react always).
- Which props sway: the tree keys (`PROP_TREE_KEYS`: `birch_`, `pine_`, `fir_`); the species factors are `sway.species`. Rocks, structures and the village's own kit never move. The model height comes from the lod0 bounds and is used by every band, so a tree's lean is identical in all bands and never jumps when its level of detail changes. The phase comes from the world position, never the instance index (which changes on every LOD rebin).
- `createMapPropNodeMaterial(sun, base, lodBand, grade?, largeFaces?, sway?)` sets `positionNode` when a sway profile is given; it composes with the grass depth pull because the view position derives from the displaced position. The profile is chosen in `mapPropInstancing.ts` per key; a caller that brings its own materials (the village kit) gets none.
- **Shadows stay at the rest pose** (the casters are separate materials and the maps are baked on demand), so a tree's own shadow does not move; the lean is small enough that the self-shadow drift is not noticeable.
- What does not sway: the village's buildings, and the temporary instances the forest view draws (a tree falling, a sapling growing); the standing trees are in the static prop groups and do sway.
- DEV: the "Tree sway" section of the dev panel (`dev/panel/devPanelTreeSway.ts`) moves the live uniforms.
- The gust is an analytic wave, not the grass's gust atlas; sampling the atlas in the vertex stage would line the trees up with the grass gusts but spends a vertex texture (see the open items).
- Check: `npm run check:prop-sway` (zero at the foot, monotone with height, amplitude bounds, along the wind, wrap continuity, non-tree keys excluded).

## 3. Smoke, flowers, wheat and the plants near the orb

- **Chimney smoke** uses the shared direction. The plume's wind vector is a low-pass of the shared wind (`SMOKE.WIND_SMOOTH_S`, in `VillageView.render`) so a gust bends it slowly (a puff's place is a pure function of its age); `SMOKE.WIND_MUL` keeps the calm look unchanged.
- **Flowers** use the shared direction and boost plus a small gust.
- **Wheat** is grass blades recoloured by a mask, so it sways; it now rolls in waves along the wind (`WHEAT.WAVE_*`) and lies down downwind in rain (`WHEAT.LODGE_LEAN`, from the wetness).
- **Orb reaction (always on):** grass rustles in a radius round the orb (`ORB_PLANTS.RUSTLE_*`), flowers brighten and sway (`FLOWER_*`). Both read the orb-relative offsets the shaders already had.
- Twins in `src/life/plantWind.ts` (`wheatWave`, `wheatWind`, `orbNear`). Check: `npm run check:wind`.
- Grass graph edits need a full reload and touch the LOD materials.

## 4. Drifting specks: leaves, pollen, fireflies

`src/life/particles/`: `driftField.ts` (the field class), `driftMath.ts` (the CPU twin), `speckMaterial.ts` (shared look, orb pull), `driftFields.ts` (the three fields and what decides how many show).

- A field is one `InstancedMesh` of sprites inside a box that follows the camera (`boxM`). Where a speck is comes from its static seed (`iSeed`, golden-ratio `seedAt`), the wind it has been carried by (integrated on the CPU and wrapped modulo the box, so a gust never makes a speck jump), the clock and the box centre. Nothing is uploaded after the start.
- The share shown is a density: speck `i` shows when `smoothstep(seed.w, seed.w + 0.08, density × 1.08)`. The rules are in `src/life/driftRules.ts`: `leafShare` (near trees, more in wind, fewer in rain and at night), `pollenShare` (a still, dry day over open ground), `fireflyShare` (a night thing, many in woods and on the shore, thinned by gales and rain).
- **Habitat** is a coarse grid of the map's trees (`src/life/habitat.ts`, `CELL_M`): `density` (how wooded) and `birchShare` (birch leaves are copper). `woodCentres` lists the woods the birds use. The shore comes from the camera's ground height against the water level (`shoreness`).
- **Orb:** fireflies within `orbPullM` of the orb drift toward it once the world is alive (`ORB_NOTICE`, eased in over 1.5 s), the shader twin of `orbPulled`.
- Accepted: the habitat is read at the camera, not per speck (a clearing in view inside a wood still shows leaves), fireflies keep their height relative to the box and do not follow terrain per speck, and counts are not scaled by quality tier.
- Check: `npm run check:drift` (the tree grid, the rules, the speck maths, the cloud maths).

## 5. Sheep and hens

`src/life/animals/`:

| File | Job |
|---|---|
| `animals.ts` | The manager: `createAnimals`, `update(dt)` at the fixed step, `render(alpha, viewX, viewZ)`, `addBirdFlock`, `setAlways`, `counts`, warm-up hooks |
| `animalSim.ts` | Pure: a flock is a disc, each animal rests then walks to a new spot, never onto unwalkable ground; a scare makes a hen run |
| `animalWalkable.ts`, `animalPlacement.ts` | Pure: where an animal may stand (dry, gentle ground clear of buildings, wheat and trees) and how many a village keeps and where (read-only on the village) |
| `animalPose.ts` | Pure: the rig functions by part name (`RIGS`) |
| `animalModels.ts`, `animalModelFromScene.ts`, `animalKit.ts` | The code-built stand-ins; reading a modelled GLB; loading `public/models/animals/<key>.glb` |
| `animalRenderer.ts` | One `InstancedMesh` per part per model; matrices written per frame |

- **Count and place:** sheep `PER_VILLAGERS` 6 (3 to 8) graze a pasture at the edge of the village, on the side with most room, near the fields; hens `PER_VILLAGERS` 4 (4 to 12) scratch a yard beside the granary. They arrive when the village is converted (`sim.converted`; DEV `__pantheonLife.farm(true)`), grow into view over `ARRIVE_S`, and stay.
- **Motion:** the sim steps at the fixed step with the previous state kept for interpolation; stride comes from distance travelled so feet do not slide. Hens within `SCARE_RADIUS_M` of the orb scatter from Phase 1.
- **Rendering:** no skinning, no clips: the animal is rigid parts, each a matrix `base × T(pivot + offset) × R(pose)` written per frame, lit by the prop material (`createMapPropNodeMaterials(sun, material, 0)`, so sun, shadows and the grade match the rest of the world), with a blob shadow under it. Animals are drawn within `DRAW_DISTANCE_M` of the camera; there are no LODs.
- **Models:** see the contract below. A key with no file keeps its stand-in.

## 6. Birds

`birdSim.ts` (pure) and the same renderer. A flock has a centre, a circle round it and a level.

- **Ambient flocks** (`BIRDS.AMBIENT.FLOCKS` of them, on every map that has woods) circle a wood by day, move on to another wood now and then (the circle closes into a loose cluster in transit), and fly off when the orb comes within `SCARE_M` of one of their birds (Phase 1+). They are out only by day and not in rain (birds grow and shrink over `FADE_S`, so none pops).
- **A place's flock** (`place: true`) only circles its place and ignores the orb; `level` says how many of its birds are out (rain still sends them in).
- Each bird banks into its turn, climbs and glides between wingbeats from its own movement; birds are drawn larger than life (`MODELS.*.SCALE`) because a real songbird is invisible at flying height.
- Check: `npm run check:animal` (deterministic walks, stays on land and in range, count against population, no overlap, the pose rigs, the model loader, the flocks' behaviour).

## 7. Life at the places of power

`src/life/lifeRules.ts` (pure) decides the level, `src/life/placeLife.ts` draws it, `src/life/ambientLife.ts` ties it to the story and is made in `initGameplay` (next to `landmarkLights`, updated in the fixed step).

| Story state | Level (`PLACES.LEVELS`) |
|---|---|
| Asleep | 0 |
| Awake | `AWAKE` 0.25: faint and rare |
| Restored by the village | `RESTORED` 1: the full set |
| The name has returned (the last quest is done) | at least `TRACE` 0.3 at every place, for good |

- `placeTarget(facts)` is the level a place heads for; `easeLevel` moves the level there over `EASE_S`. Nothing subscribes to events: the level is recomputed each step from `landmarks.isAwake/isRestored` and `quest.isDone(finale)`, so a load is correct for free, and every place starts at its level on construction.
- **What each place has:** the tree has songbirds circling it and leaves shed from its crown; the sunken ruin fireflies hovering over the water at night; the runestones fireflies gathered on the ring of the stones; the temple ruin doves circling the roof; the monolith dust motes rising round the rock.
- The clouds are `particles/cloudField.ts` (shader) and `cloudMath.ts` (twin): stateless functions of the seed, the wind clock and the wind, in three styles (`swirl` fireflies orbiting, `rise` motes climbing and fading, `shed` leaves falling downwind). Fireflies are gated by `fireflyGate(night01, golden01)`: full at night, `FIREFLY_GOLDEN` at dusk and dawn, none by day. In Phase 0 the sun is pinned to night, so awake places show their fireflies.
- All the clouds and flocks are made at the start with no place yet (`createPlaceLife` in `main.ts`, before the warm-up). `ambientLife` then gives each place of the map its spot and level.
- Not built: the finale flare (lifting a place's life with its beam while the cutscene plays).
- **No shipped map has a landmark placed**, so none of this is visible in play until the five are placed in the editor (`story-mechanics/PHASE_0_TODO.md`). DEV: `__pantheonLife.fakePlaces()`.

## DEV hooks

`window.__pantheonLife` (`dev/runtime/lifeProbe.ts`):

- `fakePlaces(radiusM?, x?, z?)`: stands up the places the map lacks in a ring round the orb (or `x, z`), each at full level; `clearFakes()` takes them away.
- `list()`: each place's level, target and any held level. `setPlaceLevel(kind, level | null)`: hold a place at a level whatever the story says; `null` lets go.
- `animals()`: sheep, hens, flocks and birds out now. `farm(on)`: have the farm animals now whatever the village's state.
- Fireflies show at night: scrub the time of day in the dev panel. The tree sway has its own dev panel section. `__pantheonWeather` forces rain (and so the gust before it).

## Checks

`npm run check:wind`, `check:prop-sway`, `check:drift`, `check:animal`, `check:life` (all in `check:fast`). `check:life` covers the levels per story state, the permanent trace, easing, the firefly gate, the chosen set of life per place, that a load starts every place at its level, and the DEV places.

## Models to make

The stand-ins are chunky vertex-coloured toys. Yours replace them one file at a time (`public/models/animals/<key>.glb`); the keys, part names and the rig contract are in `story-mechanics/PHASE_0_TODO.md` ("Animals and ambient life").

## Open

- A look on a real GPU: tree sway amplitude and the gust sweep, tree shadows (rest pose), first-draw hitches, the grass lean now toward the west, firefly and leaf density, the look of the animals and birds, the place clouds. The list is in `story-mechanics/PHASE_0_TODO.md`.
- Following up: the grass gust atlas for trees (vertex texture cost), animal LODs, per-speck habitat, tier-scaled counts, the finale flare.
