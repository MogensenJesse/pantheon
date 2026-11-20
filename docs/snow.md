# Deep snow

Snow you wade through. Where the terrain snows, a soft shell of snow lies over the faceted ground: the orb ploughs a furrow in it and slows down, villagers and sheep leave prints, the prints fill back in over minutes (faster while snow falls), and the grass under it is gone. **Off by default** (`VISUAL.snow.enabled = false`: then nothing is drawn and no pass runs); switch it on in the DEV section **Snow** or with `VISUAL.snow.enabled = true`.

## How it fits together

| Where | What |
| --- | --- |
| `src/config/visual/snow.ts` | Every number (thickness, bake grid, clipmap, tracks window, reach, refill, orb furrow and wading, grass kill, walker prints). Edits to the file restart vite (it can crash: stop and start the dev server); the DEV section edits the same object live |
| `world/snow/cpu/snowNoise.ts`, `cpu/snowBake.ts` | Pure bake over the whole map at 2 m texels (1024²): chisel Y per texel, a 5-tap blur, snow weight = CPU twin of the terrain splat's snow line (height smoothstep with `triNoise3D` noise, sun aspect) x (1 - slope rock); hull = chisel + smoothstep(0, .25, w) x (blur - chisel) + `thicknessM` x w. Outputs `hull`, `depth` (>= 0) and `slope` (2 floats). Takes about 150 ms, run lazily the first frame the shell is on |
| `cpu/snowClipmap.ts`, `snowSurfaceMesh.ts` | The shell: 9 levels of 64 x 64 cells from 0.125 m, doubling (59 328 triangles, one draw). Each level snaps to its own cell size in the vertex shader (`aCell`); the hole is one cell smaller than the finer level's extent, so rings overlap instead of needing trims. `renderOrder -10`, polygon offset -2 so it wins depth over the terrain |
| `snowMaps.ts`, `snowShellMaterial.ts` | R32F hull (four `textureLoad`, bilinear by hand) and an RGBA16F map (slopeX, slopeZ, depth). Alpha = baked depth, `alphaTest` 0.03 m. Furrow = min(field, depth) x reach, on levels with cells <= 0.51 m, fading from `fieldNearM` to `fieldFarM` away from the orb. Terrain lighting (`terrainUniforms`, receiver sun shadow), cavity AO from the field |
| `snowField.ts`, `cpu/snowFieldMath.ts`, `cpu/snowBrushRects.ts` | The tracks field: a toroidal RG16F target (R depression, G berm) of 1024² over a 64 m window, stamped by brushes with max blending (a scissor per brush: only the texels it reaches). `maintain` is one multiplicative pass that fades the field and clears the strip that entered when the window re-centres (snaps to 2 m with 8 m of hysteresis). Decay time is banked and applied once a second (a half-float cannot hold a per-frame fade) |
| `snowSystem.ts` | Once a frame (`frameTick` render hook in `main.ts`, following `player.position`): lazy bake, `uSnowSplatMul` (the terrain's own snow colour steps aside), field upkeep, the orb's furrow (`walkStride`), the walkers, flush |
| `snowEmitters.ts`, `cpu/snowStride.ts` | Prints for villagers (the `Villagers` arrays) and sheep (`animals.hand.sheepWithin`): one per stride, feet alternating, only within `windowM / 2 - hysteresisM` of the orb, only on snow >= 5 cm, none indoors |
| `cpu/snowDepth.ts` | The baked depth for gameplay: `snowDepthAt` (bilinear), `snowSpeedMultiplier`, `snowSinkM`. Set only while the shell is on |
| `src/entities/PlayerController.ts` | Speed x lerp(1, `slowMul`, smoothstep(0, `slowDepthM`, D)); the orb rides `sinkShare` of D (up to `sinkCapM`) below the snow top, so the camera sinks with it |
| `src/world/grass/data/grassDataTexture.ts` | The grass density is multiplied by 1 - smoothstep(`grassKill.startM`, `endM`, D). `main.ts` passes `onDepthChange` so the grass map is filled again when the shell goes on or off and on a re-bake |
| `src/world/weather/weather.ts`, `rendering/weather/` | `snowShare(height, line, fade)` (config `WEATHER.SNOW_FADE_M`; the line is the terrain's `snow.heightStart` x height scale): precipitation above the line is snow. `weatherLook.snow01` = rain x share at the camera; snow does not wet the ground; `rainStreaks.ts` turns that share of the streaks into slow round swaying flakes (`LOOK.FLAKES`). Snowfall runs the prints' fade `1 + refill.snowfallMul` times as fast |
| `src/dev/panel/devPanelSnow.ts` | DEV section **Snow**. Probe `__pantheonSnow` (`stamp`, `rebake`, `stats`, `player`, `anchor`); `__pantheonLife.sheep()` lists the sheep, `__pantheonWeather.look()` includes `snow` |
| `scripts/checks/snow/snow-check.ts` | `npm run check:snow` (13 checks: noise, weight, bake, clipmap, field window and strip clear, refill banking, depth, orb, stride, brush rects). `weather-check.ts` covers `snowShare` |

## Rules worth knowing

- **The shell sits on chisel Y** (the AGENTS rule), 0.8 m of snow where the weight is 1; it never changes `getWorldY`. Gameplay that stands on the terrain is below the snow top in deep snow (the orb's sink is the only thing that follows it).
- The bake ignores the mountain-biome weight (10 % scale on the splat's line) and the shell is binary at 3 cm of depth, so the snow region can be wider than the old tint.
- `fieldFarM` must stay under `windowM / 2 - hysteresisM` (24 m) or the strip clear shows. Walker prints beyond that distance would wrap round the window, hence the same limit.
- Prints refill with real frame time (like wetness): `refill.depressionTauS` 600 s, `bermTauS` 240 s. The village DEV time scale does not touch it.
- three's `QuadMesh` has uv.y running **down** the target, so a brush's scissor rect rows are `fract(z / windowM) x res` from the top, not flipped.

## Not done

Fresh-snow thickness growing with snowfall, glints, cleared discs round landmarks and the village, a shader warm-up (the first frame the shell is on compiles it and bakes), a far (> 150 m) look at the 16 to 32 m rings, frame-cost numbers (the pane runs at about 1 fps), and the decision to ship it on.
