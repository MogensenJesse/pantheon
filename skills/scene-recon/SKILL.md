---
name: scene-recon
description: Image-to-Blender-scene route built on model-loop. Trellis 2 (via the Weave tools of the Figma MCP) makes each piece's geometry from an AI close-up, GPT Image makes the look, Blender cleans, retextures and assembles, an independent judge scores. Metric placement comes from the known square ground tile in the input image. Use when the user wants to try the reconstruction route ("recon", "Trellis", "2D to 3D") instead of hand-modelling every part, e.g. on the great tree (see 3d-plan.md).
---

# Scene recon (input image → pieces from Trellis → retextured, placed, judged)

An alternative to hand-modelling with `model-loop`: same run-folder layout, same references, same judge, same
review gates and freeze rule. Only the geometry source changes: a Trellis 2 mesh per piece instead of a builder
script, cleaned by `recon_import.py`. Reuse model-loop's scripts by path; do not copy them. The plan this skill
implements is `3d-plan.md`; its first run is a vertical slice (two pieces end to end, then stop for review).

## Requirements
- Everything model-loop needs (see `../model-loop/SKILL.md`): Node + `sharp` (`npm install` in `../model-loop/scripts`),
  the `blender-agent-skills` plugin (`loop_render` and `qa_check` import it), the `model-judge` agent.
- **Weave through the Figma MCP**: authorised, and a Weave plan linked to the Figma account. Tools:
  `weave_find_model`, `weave_upload_asset`, `weave_run_model`, `weave_get_model_run_output`.
- `OPENAI_API_KEY` for GPT Image (`../model-loop/scripts/openai-image.mjs`). In a cloud session the key is a proxy-injected
  credential: run the node scripts with `OPENAI_API_KEY=proxy-injected`; the proxy supplies the real one. Never print it.
- Blender: live Blender MCP if connected, otherwise the `bpy` wheel (headless, see below).

## Paths
- `SKILL_DIR` = this folder; `S` = `SKILL_DIR/scripts`; `M` = `SKILL_DIR/../model-loop/scripts`.
- Run folder `R` = `<project>/assets-src/model-loop/<asset>_recon/`: `input.png`, `refs/`, `textures/`, `meshes/<id>.glb`,
  `scene.json`, `scores.jsonl`, `renders/`, `rounds/`, `<asset>_recon.blend`. Node scripts run from the project root.
- The source run (e.g. `great_tree/`) stays untouched: take an md5 listing before the copy and compare after the run.

## Weave and credits
- Trellis 2: model id `c368da57-9b0a-4d1d-bf8b-b7ca16482e91` (`fal-ai/trellis-2`), about **30 credits per run**. Input `image_url` (an uploaded
  asset), params `resolution` 512/1024/1536 (default 1024), `texture_size`, `decimation_target` (vertices, default 500000), `remesh` (default
  true), `seed`. Output `3D_model` (GLB). The older "Trellis" (`fbgSp5DMNzehH2NhobbS`) is about 2 credits: fine for a dry run of the pipeline.
- Re-check ids and costs with `weave_find_model` (read-only) at the start of a run; they move.
- **Every run spends credits.** `weave_run_model` first only quotes. Show the quote, get an explicit yes for that run, then repeat the call with
  `acknowledgedCost`. Rework rounds change cleanup and material knobs (free); re-running Trellis needs a new input view or ref, and the user's OK.
- Depth Anything V2 and SAM were not in Weave's model list on 2026-11-13. Depth is skipped (it was only a front/back cross-check);
  segmentation falls back to a GPT flat-colour object-ID map of `input.png` (read the bounding boxes from it).
- Downloading the GLB needs the output host to be allowed by the environment's network policy. If it is blocked, say which host and ask; do not guess.

## Workflow
1. **Copy the run** to `R` (art only): `input.png`, `refs/`, the tile textures. Leave out the submodel builders, blends, renders, rounds and scores.
2. **Style sheet first.** One GPT image of material swatches made from `input.png` (bark, moss, leaf, stone, water, rune glow). Keep an existing
   tile when `node M/colstats.mjs` says it matches the sheet; regenerate only the mismatches (at most 3 each, each is a paid call).
3. **Manifest `scene.json`** (all pieces listed, only the slice pieces built): camera, units, materials, and `pieces[]` with id, source
   (`trellis` | `procedural` | `instance`), ref, bbox_px, pos_m, dims_m, yaw, instances, status, best, review_at, pass_at.
   - Camera and positions from the ground tile (below). Conventions: Blender Z up, metres, origin at the tile centre, front = -Y.
   - The scale is an assumption kept from the old plan (tree 10.5 m, runestones 3.2 m). The whole scene can be rescaled later.
4. **Refs**: reuse `refs/<id>.png` where one exists; make missing close-ups with `openai-image.mjs --image R/input.png` ("<piece> only, no crown,
   no stones, no water", plain light-grey background). A rune or detail mask is a GPT flat white-on-black image, front-projected as emission.
5. **Trellis**: upload the ref (`weave_upload_asset`), quote, get the OK, run, download to `R/meshes/<id>.glb`. One organic mass is one run
   (trunk and roots together). Repeats are instances of one mesh with yaw and scale variation (the three runestones).
6. **Blender**: `recon_import.run` → materials with `loop_mat.material(...)` (box projection in object space, not Trellis UVs; Trellis colours are
   always thrown away) → `qa_check` per object → `loop_render.run` (4 turntable views + the ref view) → `node M/sheet.mjs` next to the ref →
   `model-judge` (same prompt contract as model-loop) → append to `R/scores.jsonl`.
7. **Rounds change knobs only**: decimate level, scale, material. model-loop's caps and noise rule apply. At ≥ review_at (5) or the cap, stop and show
   the user the sheet, score history and top defects. The user accepts (frozen) or asks for more; never mark a piece accepted without them.
8. **After the slice review** (not in it): crown, leaf pads, rockery, water, ivy, assembly from `scene.json`, camera match and the whole-scene compare
   loop, and the game export (LOD, UV bake).

## Metric placement from the ground tile (`scripts/camera_fit.py`, numpy only)
The square tile in `input.png` is a known square. Four corner pixels fix the camera exactly.
```python
from camera_fit import fit
cam = fit([FL, FR, BR, BL], (W, H), tile_m=<side in m>)   # front-left, front-right, back-right, back-left (pixels)
cam.az, cam.el, cam.lens_mm, cam.dist, cam.rms_px         # (az, el, lens) = loop_render's ref_view
cam.ground_xy([(px, py)])                                 # mask-bottom pixel -> (x, y) on the ground = a piece's position
cam.blender()                                             # location / rotation_euler / lens for the match camera
```
- Corner labels are world labels; the azimuth is relative to which edge you call front. Mirrored corner order raises `ValueError`.
- `python scripts/camera_fit.py --selftest` (corners reproject within 3 px, exact when noiseless, ground round trip, mirrored order refused) and
  `run_bpy.sh test_camera_fit_bpy.py` (the Blender camera gives the same pixels as the numpy projection, < 0.05 px).
- The lens is the least certain output with noisy picks; azimuth and elevation are stable. Pick corners at pixel precision, from the mask.
- Depth is not metric here: use the tile plane for X/Y, and `dims_m` for size.

## Cleaning a Trellis mesh (`scripts/recon_import.py`, bpy)
`recon_import.run(glb, name, dims_m, tris, fit="fit")`: import → bake parent transforms and join → merge by distance → drop loose bits → outward normals →
decimate to about `tris` → scale to `dims_m` → origin at bottom-centre → strip material, images and colour attributes. Piece goes into `P_<name>`.
Returns triangles before/after, loose bits removed, scale, final size. `fit`: `"fit"` uniform inside the box (default), `"height"`, `"axes"` (distorts).
Trellis output is raw: about 1 m tall, dense, one baked material, UVs fragmented (the reason for box projection). Test: `run_bpy.sh test_recon_import.py`.

## Headless Blender (no Blender app, no GPU)
- `BPY_PY=<python with bpy> scripts/run_bpy.sh <script.py>` runs a script with `scripts/` on `PYTHONPATH` and prints only result and error lines.
- `import headless; loop_render = headless.setup()` makes model-loop's `loop_render` render with **Cycles on the CPU** (EEVEE needs libEGL / a GPU). About 12 s
  for 4 views + ref at 384 px; set `LOOP_CYCLES_SAMPLES` (default 24) for noise vs time. model-loop's files are not modified.
- The studio rig's `LD_Backdrop` ends in black when the ref camera looks past its edge. That is how the plugin's rig looks, not a render fault.
- `run_bpy.sh` sets `PYTHONDONTWRITEBYTECODE=1` because `../model-loop/scripts/__pycache__` is tracked.
- Blender 5: after `bpy.data.objects.remove(...)` call `view_layer.update()` before iterating `view_layer.objects` (stale `None` entries).

## Verification at the end of a run
- The source run's md5 listing matches the one taken before the copy.
- `camera_fit` self-check passes; the tile corners reproject within 3 px.
- `qa_check` shows no errors on each imported piece.
- Each round has renders, the judge's score is in `scores.jsonl`, and the final review sheet went to the user.
- No game code changes.
