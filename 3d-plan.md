# Great tree: test the 2D-to-3D reconstruction workflow (vertical slice)

## Context
The great tree (world ash) landmark is being built with the `model-loop` skill in `assets-src/model-loop/great_tree/` (hand-modelled parts: bark_limb 5.6, runestone 5.0, a trunk test). You want to try a new workflow on the same art: Trellis.2 makes the geometry, GPT Image the look, Blender assembles, Claude orchestrates. Your answers so far:
- Weave runs through the Figma MCP: Trellis.2, plus the Depth Anything V2 node for depth.
- Always retexture: Trellis colours are thrown away.
- First run is a vertical slice: two pieces end to end, then stop for your review.

The original run folder stays untouched.

## Before I can start (your side)
1. Authorize the Figma MCP (`plugin:design:figma`) with `/mcp`. It is unauthorized in this session, so no Weave tool is visible yet.
2. Link the accounts: in Weave, Settings > Profile > Linked accounts > Figma. This needs a Starter, Pro, Team or Enterprise Weave plan, with the right workspace active.
3. Every Weave run spends Weave credits. I show the quoted cost and wait for your yes on each run (Weave's MCP asks the same).

## 1. Copy the run → `assets-src/model-loop/great_tree_recon/`
- **Keep (GPT art):** `input.png`, `refs/` (all 7 close-ups + logs + sheet), `textures/bark.png`, `textures/leaf.png`.
  - Also copy `stone_cut.png` and `moss.png` from `temple_ruin/textures/`, so the run stands on its own.
- **Copy the launcher only:** `build/run.sh` (it picks the newest Blender), with the path changed.
- **Leave out (the submodels):** `build/*.py`, `great_tree_work.blend(1)`, `renders/`, `rounds/`, `scores.jsonl`, and `plan.json`'s nodes. Its `materials` block moves into the new manifest.
- No parts from temple_ruin (boulder, rubble, vine) are reused. Everything new comes from Trellis or Blender.

## 2. New skill `.claude/skills/scene-recon/SKILL.md` (your draft, with these changes)
It reuses model-loop's scripts by path and adds no copies: `openai-image.mjs`, `sheet.mjs`, `colstats.mjs`, `loop_render.py`, `loop_mat.py`, `qa_check`, and the `model-judge` agent.
- **Compare by an independent judge.** Claude does not grade its own renders: `model-judge` scores each piece, with the same 5/10 review gate and freeze rule as model-loop. You decide at every gate.
- **Metric coordinates from the ground tile.** The square tile in `input.png` is a known square. Fitting the camera to its four corner pixels gives azimuth, elevation, lens and distance. Mask-bottom pixels then cast onto that plane give each piece's X/Y.
  - Depth Anything V2 is used for front/back order and as a cross-check, not for metric depth.
  - Conventions: Blender Z-up, metres, origin at the tile centre, front = -Y.
  - The scale is an assumption kept from the old plan: tree 10.5 m, runestones 3.2 m.
- **Trellis output is raw.** It always comes out about 1 m tall, dense, with one baked material.
  - On import: scale to `dims_m`, merge by distance, drop loose bits, decimate, put the origin at bottom-centre, and strip its material.
- **Retexture with box projection, not UVs.** Trellis UV atlases are fragmented, so tileable style textures go on through `loop_mat`'s object-space box projection, as model-loop does now. A UV bake is a later step for the game export.
- **Style sheet first.** One GPT image of material swatches is made from `input.png` (bark, moss, leaf, stone, water, rune glow). Existing tiles are kept when `colstats` says they match the sheet; only mismatched ones are regenerated (at most 3 each).
- **Pieces sized for Trellis.** One organic mass is one run (trunk + roots together). Repeats are instances: the three runestones come from one mesh with yaw/scale variation.
- **Credit discipline.** Rework rounds change cleanup and material knobs, which costs no credits. Re-running Trellis (a new input view or a new ref) only happens with your OK.
- **Segmentation.** If Weave's model list has a segmentation model (SAM), use it. Otherwise GPT Image makes a flat-colour object-ID map of `input.png`, and I read the bounding boxes from it. Background removal is left to Trellis, since the refs already sit on plain grey.

### New scripts (only two) in `.claude/skills/scene-recon/scripts/`
- `camera_fit.py` (numpy only, already installed):
  - fits the camera to the 4 tile corners by search over az/el/lens/dist;
  - `ground_xy(px)` casts a pixel ray onto z = 0;
  - an assert self-check: the corners reproject within 3 px, and a round trip on known points.
- `recon_import.py` (bpy): `run(glb, name, dims_m, tris)` does the import → join → merge → loose-part filter → decimate → scale → origin → strip materials, and returns a stats dict.
- **Moss on top faces:** this reuses temple_ruin's moss-paint recipe if its build has one. Otherwise it adds an optional `over=png, over_up=` mix (up-facing + noise) to `loop_mat.material`, off by default, so existing callers don't change.

## 3. Run the slice in `great_tree_recon/`
1. **Manifest:** run Depth Anything V2 on `input.png` (Weave), make the masks, fit the camera, then write `scene.json`.
   - It holds the camera, units, materials, and `pieces[]`: id, source (`trellis`/`procedural`/`instance`), ref, bbox_px, depth_med, pos_m, dims_m, yaw, instances, status, best, review_at/pass_at.
   - It lists the whole scene; only the two slice pieces get built.
2. **Refs:** `runestone` uses the existing `refs/runestone.png`. `trunk_roots` gets one new GPT close-up from `input.png`: "trunk and roots only, no crown, no stones, no water".
   - Also a rune mask: a GPT flat white-on-black knotwork from `refs/runestone.png`, front-projected as emission.
3. **Trellis.2 in Weave:** upload each ref, run it (after you OK the cost), and download the GLB to `meshes/<id>.glb`.
4. **Blender** (live MCP if it's connected, else headless via `run.sh`):
   - `recon_import.run`;
   - apply materials with `loop_mat` (stone_cut + moss + rune glow; bark + moss);
   - `qa_check`, then `loop_render` (4 turntable views + the ref view);
   - `sheet.mjs` next to the ref;
   - `model-judge`, logged in `scores.jsonl`.
5. **Rounds** change knobs only (decimate level, scale, material). Model-loop's caps and noise rule apply. At ≥ 5/10 or at the cap, stop and show you both pieces: sheet, score history and top defects.
6. **Out of the slice, for after your review:** the crown, leaf pads, rockery, water, ivy, the assembly from `scene.json`, the camera match and the whole-scene compare loop, and the game export (LOD, UV bake).

## Verification
- The original is untouched: an md5 listing of `great_tree/` is taken before the copy and matches after the run.
- `camera_fit.py` self-check passes; the tile corners reproject within 3 px.
- `qa_check` shows no errors on each imported piece.
- Renders exist for each round, the judge score is in `scores.jsonl`, and the final review sheet goes to you.
- No game code changes: `tree` keeps its `birch_rune` stand-in.
