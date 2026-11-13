---
name: model-loop
description: Image-to-Blender-model loop. From one input image, split the object into parts, model each part in the live Blender session (Blender MCP), score it against an AI close-up reference with the independent model-judge agent, and rework until it scores at least 5/10, then show the user, who accepts it (frozen from then on) or asks for more rounds toward its pass mark (7 parts, 8 groups, 9 whole); then assemble bigger groups from accepted parts up to the whole model. Textures come from OpenAI (gpt-image). Use when the user gives an image and asks to model it with the loop, "model this", "build this in Blender until it scores 9".
---

# Model loop (image → parts → assembled model, judged and reviewed)

Build small to large: every leaf part (brick, rock, plank, rope) is accepted on its own first, then each group made of accepted parts, then the whole model. The builder (you) never grades its own work: the `model-judge` agent does, from images only. The user has the last word at every review gate.

Output is a `.blend` only (no triangle budget, no UVs, no game export).

## Requirements
- Blender 5.2+ with the Blender MCP add-on connected (`execute_blender_code`, `get_objects_summary`).
- The `blender-agent-skills` plugin (marketplace `EL4CTEO/blender-skills`). `loop_render` imports its `turntable.py` and `render_batch.py`, and the QA gate uses `qa_check.py`.
- Node 20.12+, with `sharp` resolvable from `SKILL_DIR/scripts`. Either the project has it, or run `npm install` once in `SKILL_DIR/scripts`.
- `OPENAI_API_KEY` in the environment or in the project's `.env`. Never print it.
- The `model-judge` agent: a copy of `SKILL_DIR/model-judge.md` in `~/.claude/agents/` or the project's `.claude/agents/`.

## Paths
- `SKILL_DIR` = the folder this file is in (Claude Code shows it as the skill's base directory). `S` = `SKILL_DIR/scripts`.
- Run folder `R` = `<project>/assets-src/model-loop/<asset>/` unless the project has a better place:
  - `input.png`, `plan.json`, `refs/`, `textures/`, `build/<id>.py`, `renders/<id>/`, `scores.jsonl`, `rounds/`, `<asset>.blend`.
- Run the Node scripts from the project root (that's where the `.env` is read from).
- Worked builders from the first test (a stylised well) are in `SKILL_DIR/examples/`; see Recipes.

Read `blender-agent-skills:blender-core` once per session (rules for `bpy` over MCP). Pull in `blender-hardsurface-modeling` and `blender-sculpting` for technique when a part needs them.

## 1. Set up
1. Make `R`, then copy the input to `R/input.png` (convert to PNG with sharp if it's a JPG).
2. Blender MCP `get_objects_summary`. If the open file has a path or holds anything beyond the default Cube/Camera/Light, **ask before** replacing it.
   - Then `bpy.ops.wm.read_homefile(use_empty=True)` (only after the OK, or when it's the untouched default scene).
   - Then `bpy.ops.wm.save_as_mainfile(filepath=R/<asset>.blend)`.
   - If Blender was restarted mid-run, reopen `R/<asset>.blend` (`bpy.ops.wm.open_mainfile`).
3. Collections:
   - `PARTS`, holding one `P_<id>` per leaf part. Keep it included in the view layer while working: modifiers and `qa_check` only evaluate objects in the view layer, and `loop_render` isolates collections by itself. Exclude `PARTS` only at the end (step 6).
   - One `G_<id>` per group. The root group is `G_<asset>` at the top level.
   - Only touch what you created.

## 2. Break it down → `plan.json`
Look at the input and write the tree. Leaves are the smallest repeated or unique pieces. Groups are made of leaves or other groups. Give real sizes in metres (a person is 1.8 m; a door is about 2 m).

```json
{"asset": "temple", "style": "chunky stylised Norse, weathered, hand-painted look",
 "materials": {"stone": {"prompt": "grey granite with lichen", "texture": "textures/stone.png", "tile_m": 1.0, "roughness": 0.85}},
 "nodes": [
  {"id": "brick", "kind": "part", "desc": "rough-cut granite block, chipped edges", "dims_m": [0.5, 0.25, 0.25],
   "materials": ["stone"], "variants": 3, "ref": "refs/brick.png", "ref_view": [35, 25, 85],
   "review_at": 5, "pass_at": 7, "status": "todo", "best": null},
  {"id": "wall", "kind": "group", "children": ["brick"], "desc": "dry-stone wall, 9 courses", "dims_m": [6, 0.5, 2.2],
   "ref": "refs/wall.png", "ref_view": [20, 15, 50], "review_at": 5, "pass_at": 8, "status": "todo", "best": null},
  {"id": "temple", "kind": "group", "children": ["wall", "altar"], "desc": "...", "dims_m": [12, 9, 8],
   "ref": "input.png", "ref_view": [30, 20, 35], "review_at": 5, "pass_at": 9, "status": "todo", "best": null}]}
```

- `ref_view` = `[azimuth, elevation, lens_mm]` of the camera in that reference. Azimuth 0 means seen from the front, 90 from the right, -90 from the left. Elevation is in degrees above the horizon. Estimate it from the image.
  - Use 85 mm for the AI close-ups of parts: they are drawn almost orthographic, and 50 mm makes the judge flag perspective distortion.
- `status`: `todo` → `review` (shown to the user) → `accepted` (with `"frozen": true`).
- Order of work: post-order (all leaves, then each group once all its children are accepted, the root last).

## 3. References (AI close-ups)
For every node except the root:
```
node S/openai-image.mjs --image R/input.png --out R/refs/<id>.png --prompt "From this image, show only <desc>. Isolated, centred, the whole object in frame, three-quarter view from slightly above, plain light-grey background, soft even light, no other objects. Keep exactly the same style, colours, proportions and wear as in the image."
```
- About 15 s per image; several can run in parallel. Use `--quality high` only when a medium ref is too vague.
- For a group, say what to leave out ("no roof, no planks") or the close-up may include neighbours, and the judge will then mark the group down for missing them.

**Checkpoint (first stop):**
1. `node S/sheet.mjs --out R/refs/sheet.png input=R/input.png brick=R/refs/brick.png ...`
2. Show the user the parts tree (one line per node: id, size, children) and the sheet.
3. Wait for their OK. They may swap images in `refs/` or change the tree.

## 4. Per node, the loop
Round `NN` starts at 01. Each round:

### a. Build or rework (`execute_blender_code`)
- Keep each node's builder in `R/build/<id>.py` with `build(name, seed, dims)` and a `P = dict(...)` of knobs at the top. A rework is then "edit the knobs or the recipe, re-exec": `sys.path.insert(0, R/build); import <id>; importlib.reload(<id>)`. Note each judge round's fix in a comment next to `P`.
- **Part:** model at the world origin in `P_<id>`, sitting on z = 0, at real size.
  - Make real secondary forms with planes, bevels and booleans: chamfers, chisel chips, grooves, faceted planes. See Recipes. Avoid noise displacement on dense meshes: it reads as melted clay.
  - Perfect boxes and cylinders never pass.
  - With `variants > 1`: make `<id>_a`, `<id>_b`, ... with different seeds or sizes.
  - A part may be several objects (the windlass is a log plus a rope). Render them together; check each one with QA.
  - A part may reuse a frozen material (the windlass log uses the frozen timber material). Tell the judge it's frozen.
- **Group:** in `G_<id>`, place parts as linked duplicates, `bpy.data.objects.new(name, part.data)`, so they share the part's mesh. Place sub-groups as collection instances (`instance_type = "COLLECTION"`).
  - Add seeded variation, but keep it small: rotation ±1–1.5°, height ±2%, ±1 cm offsets, and mix the variants. Bigger jitter reads as sloppy (shaft judge).
- **Frozen parts stay frozen.** Once the user accepts a node, never touch its builder, its variants or its material while working on bigger nodes.
  - A group round may only change the group's own builder: placement, spacing, joints, jitter, scale per copy, and new group-only pieces such as a mortar core.
  - The judge tags each defect `"scope": "part"` or `"group"`. Log `part` defects in `scores.jsonl`, but don't act on them.
  - If a frozen part holds a group under its target, say so at the review; only the user can reopen the part.
- Rules:
  - `result` must be a dict.
  - Re-import `bpy` in every call (globals don't persist).
  - Keep each call small.

### b. Gate (parts only)
```python
import bpy, sys, os; sys.path.insert(0, r"<SKILL_DIR>/scripts")
import loop_render; sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check; result = qa_check.run(objects=["brick_a"], profile="render")
```
- Fix every `errors` entry before rendering.
- Check each variant and each object on its own (`objects=[name]`). Variants checked together report each other as "floating parts".

### c. Render
```python
import bpy, sys, importlib; sys.path.insert(0, r"<SKILL_DIR>/scripts")
import loop_render; importlib.reload(loop_render)
result = loop_render.run("P_brick", r"<R>/renders/brick", "r01", ref_view=(35, 25, 85), ref_res=(1024, 1024), only=["brick_a"])
```
- This gives 4 turntable views (front, right, back, left) plus `ref` (the reference's viewpoint). It takes about 4 s.
- `ref_res` follows the reference's aspect: the input's size for the root, and 1024×1024 for the AI refs.
- `only=[...]`: show just these objects of the collection (one variant fills the frame).
- **Look at your own `ref` render next to the reference before judging** (`node S/sheet.mjs`). Fix anything plainly off without spending a judge round on it.
- **Measure the colour** with `node S/colstats.mjs R/refs/<id>.png <render>_ref.png` (see step 5).

### d. Judge
Call the Agent tool with `subagent_type: "model-judge"`. If that type isn't loaded (a new agent file only loads in a new session), use `general-purpose`, starting the prompt with: "First read <SKILL_DIR>/model-judge.md and follow it exactly as your instructions. Read no other files except the images listed here." Give it:
- what the node is, its `desc` and `dims_m`, and the `size_m` that `run()` returned;
- which parts or materials are frozen, if any;
- the reference path, then the `ref` render path and the four view paths;
- last round's defect list. **Not** last round's score.

Append one line to `R/scores.jsonl`: `{"node", "round", "overall", "scores", "defects", "renders"}`, plus `action` or `note` when you stop, revert or keep a lower round.

### e. Decide
- **Review gate:** once `overall >= review_at` (default **5**), stop and show the user:
  - a sheet with the reference, the `ref` render and one more view;
  - the score history and the top 3 defects.
  - The user then decides:
    - **Accept:** set `status: "accepted"`, `"frozen": true` and `best` in `plan.json`, save the .blend (plus `R/rounds/<id>_final.blend`), and move on to the next node.
    - **Iterate further:** keep going until `pass_at` (or the score the user names), then show them again.
    - **A direct fix:** the user may name the changes ("darker edges, chisel the edge, then it's done"). Make exactly those, render, show it, and freeze without another judge round.
- **Pass marks:** reaching `pass_at` means `overall >= pass_at` and no category below `pass_at - 1`.
  - Defaults: **7** for leaf parts (small and repeated, so lower fidelity is fine), **8** for groups, **9** for the root. The user may change any of them.
- **Below the gate or the target:**
  - Save a copy: `bpy.ops.wm.save_as_mainfile(filepath=R/rounds/<id>_rNN.blend, copy=True)`.
  - Fix the `high` defects first, then the `med` ones.
  - Do the next round.
  - If a round scores lower than the best round so far, go back to the best round's settings (keep each round's knobs in the builder's comments or in `rounds/`), then fix again.
  - Exception: if the judge marks last round's fixes as "fixed" and the drop comes from an overshoot with a known cause (too saturated, too sharp), keep the round, undo only the overshoot, and log why in `scores.jsonl`.
- **Judge noise:** scores move about ±0.7 between rounds, and its notes can flip ("edges too straight", then "edge wave overshoots"). If 3 rounds in a row don't beat the best round, stop and show the user the best round instead of using up the cap.
- **Textures:** make the node's materials (step 5) by round 1 if you can, and by round 3 at the latest. Flat grey scores `material` 2–3, and that alone keeps the mean low however good the shape is.
- **Cap:** 6 rounds for a part, 8 for a group or the root, counted from the last time the user saw the node. At the cap, stop and show the same sheet, the remaining defects and the score history. Never mark a node accepted without the user.

## 5. Textures (one tileable colour map per material, shared by every node)
```
node S/openai-image.mjs --tile --image R/refs/<id>.png --out R/textures/<mat>.png --prompt "<material prompt>. Seamless tileable texture filling the whole frame, flat albedo colour only, seen straight on, no lighting, no shadows, no perspective, no objects. Match the colours and the hand-painted style of the reference."
```
- Prompt the base colour only: no cracks, outlines or lighting. Give explicit RGB values for base, darker and lighter strokes.
- The script prints `mean` and `stdev`. Under about 8 per channel, the texture renders as flat colour: regenerate it, asking for "clearly visible soft painterly blotches".
- At most 3 regenerations per material. Each one is a paid API call.
- A plain material (rope) can use a local noise image made with sharp instead of an API call; the geometry and the curvature mask carry the look.
- Softer, broader grain without an API call: blur the texture while tiled 3×3 (so it stays seamless), then crop the centre.

Apply it with `loop_mat.material(name, png, tile_m, rough, ...)`. It uses Box projection in object space, so no UVs are needed:
```python
import bpy, sys, importlib; sys.path.insert(0, r"<SKILL_DIR>/scripts")
import loop_mat; importlib.reload(loop_mat)
for o in objs: loop_mat.edge_mask(o)   # only for mask="curv"; re-run after every rebuild (it's mesh data)
m = loop_mat.material("M_stone", bpy.path.relpath(r"<R>/textures/stone.png"), tile_m=0.6, rough=0.85, mask="edge",
                      obj_var=0.08, top_light=0.12, ao=0.3)
```

| Option | What it does | Typical |
|---|---|---|
| `mask` | `"curv"`: per-vertex curvature from `edge_mask()` (dense meshes). `"edge"`: a 0/1 `edge` face attribute set by the builder on bevel strips. | |
| `ridge`, `ridge_col` | lighten ridges / tagged edges | keep ≤ 0.15 |
| `crease`, `crease_col` | darken creases (`curv` only) | 0.25–0.5 |
| `tint`, `gain` | per-channel multiplier and overall scale; set them from `colstats` | |
| `tex_sat`, `tex_contrast` | pull the texture toward grey / toward its mean colour | 0.5–0.9 |
| `obj_var` | ± value per object, so linked copies differ | 0.05–0.08 |
| `top_light`, `bottom_dark`, `ao` | lighter up-facing faces, darker lower edge, crease AO | 0.1–0.4, 0.08, 0.2–0.45 |
| `face_var` | ± value per facet, from an `fvar` attribute the builder writes | 0.06 |
| `top_flat` | flat X/Y projection on up/down faces, so grain along X doesn't turn 90° on top | wood |
| `end_dark`, `end_rings`, `ring_scale`, `ring_offset` | darker end grain and growth rings on faces along the object's X axis; off-centre pith | wood |
| `tex_scale`, `tex_offset`, `warp` | per-axis texture scale, shift (to land a knot on the part), wandering grain bands | wood |
| `side_sat` | less saturated non-up faces (browner wood sides) | 0.7–0.85 |

- **Calibrate colour by measuring, not by eye.** `colstats.mjs` prints the median lit (top) and dark (side) colour of the object in each image. Scale `tint` per channel by `(target/current)^2.2` (sRGB to linear), normalise it to a maximum of 1, and fold the rest into `gain`. One measure-and-adjust pass usually lands within a few RGB points.
- The judge sees the studio renders as lighter than they measure. If it keeps saying "too light" after a measured match, darken 10–20% (this lifted the timber).
- **Keep edge highlights faint** (`ridge` ≤ 0.15) unless the reference clearly shows bright rims: the user found light painted rims too strong.
- Painted wood and stone: matte, roughness 0.85–0.9 and `Specular IOR Level` about 0.2–0.25. Otherwise the judge reads "plastic".
- **Wood grain:** prompt it "strictly left to right", model the part with its length along X, and pass `top_flat=True`. Check the grain direction at full render size.

## 6. Finish
- Save the .blend, with `G_<asset>` visible and `PARTS` excluded.
- Final sheet: `node S/sheet.mjs --out R/final.png input=R/input.png result=<root ref render> front=... right=...`.
- Report:
  - each node's final score and rounds used;
  - OpenAI images made (count; medium is a few US cents each);
  - the path to the .blend.

## Recipes (from the well test; code in `SKILL_DIR/examples/`)
- **Stylised stone** (`stone.py`, user-approved style):
  - A low-poly convex polyhedron: a box cut with `bmesh.ops.bisect_plane(clear_outer=True)` + `edgeloop_fill`, using planes tangent to a superquadric guide (rounder in plan, flat-topped). Use 4/3/3/3 planes per face, tilted about 7°.
  - Then 1.2 cm three-segment bevel strips on the creases, tagged `edge`, and smooth shading, sharp above 40°.
  - Material: blotchy painted texture with `mask="edge"`, `obj_var=0.08`, `top_light=0.12`, `ao=0.3`.
- **Ring wall of stones** (`shaft.py`):
  - Linked copies, widths re-spaced so the ring closes, exact half bond between courses.
  - Size each stone at the outer face for about 1 cm joints, with a dark core tube behind the stones so joints read as dark grey, not black.
  - Keep the jitter small (see Group).
- **Plank with chiselled edges** (`plank.py`, user-approved):
  - Flat 1-segment chamfer rim, then planar V-chips subtracted with one EXACT boolean.
  - Each chip is a 16 cm cube bisected by two planes yawed ±6–10° that meet 4–6 mm under the edge; 6–8 overlapping chips per long edge.
  - Build all chips in one bmesh, run `recalc_face_normals`, and set `use_self = True`. An inside-out or self-intersecting cutter makes the boolean return an empty mesh.
- **Squared beam** (`timber.py`):
  - Flat 45° chamfers of about 1.6 cm on all twelve edges, V-grooves for the "three boards" look, and 1–2 sparse chisel scoops per edge.
  - Keep it dead straight: sag, twist and side waves add up and read as a bent beam.
- **Rope coil** (`windlass.py`):
  - A tube swept along a helix with parallel-transport frames, and a 3-lobe cross-section twisting along the length. Use lobe 0.1 × radius, lay length about `2π·r / tan 45°`, 24 points per ring and 56 samples per turn.
  - Pitch about 1.04 × rope diameter so the turns touch. Coil ends dive into the log so no stubs show. Add hemispherical end caps.
  - The hanging strand is a separate tube starting inside the middle turn.

## Lessons (bmesh and Blender traps)
- **Build order:**
  1. Do cut, fill and `dissolve_limit` first.
  2. Bevel on the still-simple shape.
  3. Then cut segment loops (bisect).
  4. Deform last.
  - `dissolve_limit` after the segments merges them away, so the deformation silently does nothing. That hid "edges ruler-straight" for 7 plank rounds.
  - Segment loops crossing an unclamped bevel give sawtooth spikes.
- `bmesh.ops.bevel(clamp_overlap=True)` clamps the whole bevel to the shortest neighbouring edge (a 1.8 cm rim became 6 mm). Keep corner radii at least as wide as the bevel and use `clamp_overlap=False`, or round with creased subsurf.
- A plane yawed along a straight edge cuts deeper and deeper along it (wedges, pebble outline).
- **Failed for stylised stone:**
  - Dense voxel mesh + displacement gives melted clay.
  - Voronoi bowls give a uniform honeycomb.
  - Knife-split facets plus insets give slivers and cracks.
  - Chiselling first and rounding after melts the facets.
- When the judge keeps repeating a defect you think you fixed, probe the geometry (vertex counts, z-range along an edge) before changing anything else.
- Blender may restart between turns; check `bpy.data.filepath` and reopen the run's .blend.

## If the Blender MCP bridge is down
Run Blender headless: `blender -b R/<asset>.blend --factory-startup --python-exit-code 1 --python <script.py>` (use the full path to `blender.exe` on Windows), and write `run()` results as JSON lines. `loop_render.run` works there too: EEVEE renders headless.
