# Village kit (Blender brief)

The village draws a **code-generated placeholder kit** (`src/world/village/assets/placeholder/`) for every key that has no modelled GLB here yet. Modelled files in this folder replace their key at load (`src/world/village/assets/villageKit.ts`, table `KIT`); missing files keep the placeholder, so the kit can be replaced piece by piece. Placeholder numbers are checked by `npm run village:kit`.

**Done so far:** the temple (`temple.glb` + `_lod1` / `_lod2`, `temple_glow.glb`): stepped stone terrace with stairs, planked roofs, battens and metal-banded posts, carved portals and bands, dragon finials, inlaid roof bands; glow lines and runes (cyan, kept dimly lit by day) and the door, slit-window and corner-lantern lights (warm orange, dusk and night only) live in the glow mesh. The player's orb floats over the lantern roof; it is drawn by the game, not modelled. Per-corner ambient occlusion is baked into the vertex colours (the game ignores normal maps, so fine detail is geometry plus baked shading).

**House C** (`house_c_s0` foundation, `house_c_s1` frame, `house_c_s2` finished, each with `_lod1` / `_lod2`, plus `house_c_glow.glb`): a Nordic timber hall from the reference image, 7 x 6 m footprint (the hall is 7 x 4.8 m and a 1.2 m porch fills the front, so the pad and the door sit on the footprint edge). Stone plinth, dark timber frame with horizontal plank infill, individually laid shingles, crossed rake beams at every gable, a porch cross-gable with a plank door swung open, a front dormer, a gable-end bay, a stone chimney (smoke point in the extras) and four lit windows. Its warm atlas is `assets-src/village/village_house_atlas.png` (its own texture, the temple keeps its slate one). Built by `assets-src/village/house_build.py`, which holds one spec per house type (`SPECS`: plan, door and window spots, porch kind, chimney, finial heads).

**Workshop** (5 x 6 m, the open gable end is the front: two thick posts on stone footings, a header with braces, vertical-board gable, wide eaves, horse-head finials; inside a stone forge with its fire in the glow mesh, anvil on a stump, workbench, stool, weapon rack, barrels, crate; big stone chimney over the forge), **Granary** (3.2 x 3.2 m, four stone feet 0.9 m high, door in the gable end with a ladder, turf roof with a shingle patch, horse-head finials, no glow) and **Well** (2.2 x 2.2 m, finished only: round stone ring in three courses on a plank apron, two posts, windlass with rope, bucket and crank, small shingled roof). Built by `assets-src/village/village_extra_build.py`, which reuses `house_build.py` (exec it into the same namespace). Triangles finished: workshop 8,160 / 1,012 / 214, granary 2,904 / 952 / 376, well 1,382 / 410 / 206. Turf and rope are new atlas strips appended after the old ones, so every house GLB was re-baked with the same atlas.

**House A** (5 x 4 m, no porch: closed banded plank door with two steps, one window beside it, back and side windows, a chimney on the back slope, carved horse-head finials) and **House B** (6 x 5 m: an open porch on two thick pillars with a cross-gable and the door behind it, a window on each side, a big stone chimney, horse-head finials). Both come from the images in `.inspiration/models/Images/` (`house_a.jpg`, `house_b.jpg`), have no dormer, and use the same stages, LODs and glow files as House C (`house_a_*`, `house_b_*`). Triangles finished: A 5,774 / 1,202 / 166, B 7,632 / 1,596 / 270.

## Conventions (every asset)

- Metres, glTF Y-up. **Origin at the base centre of the footprint, y = 0 at the floor.** The door faces local **+Z** (Blender: −Y).
- The footprint is the inside of the walls; roofs may overhang it. Nothing below y = 0 except hidden foundations.
- **Normals exported.** The shipped `nordic-hut` / `stave-church` GLBs have none and shade flat; do not repeat that.
- Colour: vertex colours (`COLOR_0`) multiply the albedo, so a vertex-coloured mesh with a white material works (the placeholder does exactly this). Textures, if used, are KTX2.
- Three LOD files per asset: `<key>.glb`, `<key>_lod1.glb`, `<key>_lod2.glb`, each with the **same number of submeshes**.
- Material names are classified by substring: avoid `leaf`, `leaves`, `needle`, `bark`, `trunk`, `flower`, `petal`, `plant`, `bush`, `clover`, `mushroom` unless foliage shading is wanted. Suggested names: `wood`, `stone`, `thatch`, `plaster`, `window`, `window_glow`.
- **Metadata as glTF extras** on the building node (Blender custom properties, exported with *Include → Custom Properties*), in glTF axes (x, z = Blender x, −y): `footprint` `[w, d]` (inside of the walls, used for planning and the level pad), `door` `[x, z]`, `workSlots` `[[x, z], …]`, optional `chimney` `[x, y, z]`, optional `crownY` (height of the orb the game hovers on the building's axis). Empties do not survive the bake (its prune step drops them).
- **Textures:** one shared trim-sheet atlas (`assets-src/village/village_atlas.png`, 1024², horizontal strips that span the full width: U repeats, V stays inside the strip). The loader keeps one copy per texture name, so every building sharing the atlas costs one texture.
- **LODs are authored** (the bake's automatic simplify cannot reduce flat-shaded meshes: every edge is a UV seam).

## Asset keys

A building is built through stages, each its own mesh with the same footprint and origin:

| Key | Stages | Footprint (m) | Height (m) |
|---|---|---|---|
| `village_house_a_s0` `_s1` `_s2` | foundation, frame, finished | 5 × 4 | 5.7 |
| `village_house_b_s0` `_s1` `_s2` | | 6 × 5 (modelled, porch included) | 6.0 |
| `village_house_c_s0` `_s1` `_s2` | | 7 × 6 (modelled, porch included) | 6.6 |
| `village_workshop_s0` `_s1` `_s2` | open front | 5 × 6 (modelled, front = gable end) | 6.5 |
| `village_granary_s0` `_s1` `_s2` | on 0.9 m stone feet | 3.2 × 3.2 | 6.2 |
| `village_temple_s2` | finished only | 14 × 14 (stone terrace; cruciform temple on it) | 15.6 |
| `village_well_s2` | finished only | 2.2 × 2.2 | 3.3 |

Stage 0 is a low foundation (≤ 0.5 m), stage 1 the timber frame with an open roof, stage 2 the finished building. `village_<type>_glow` (house, workshop, temple) is a separate set of flat quads just in front of the windows, coloured warm (vertex colour); the game draws it additively at night. Keep real window panes dark in the main mesh.

Small pieces (single LOD, no stages): `village_fence` (2 m segment along local X: two posts and three rails; modelled, `fence.glb`, 156 triangles) and `village_stockpile` (logs, a stack of planks and four stakes, about 1.6 × 0.95 × 0.8 m; modelled, `stockpile.glb`, 308 triangles). Both built by `village_extra_build.py` (`make_pieces`). `assets-src/village/village_models.blend` merges the temple, the houses, workshop, granary, well, fence and stockpile in one row (a snapshot: the temple is appended from `temple.blend`, the rest rebuilt from the scripts). `village_steps` is not used by the game. There are no crop meshes: wheat in the fields is grass (the grass data map's B channel marks the plot; see AGENTS.md).

## Triangle budgets (lod0 / lod1 / lod2)

| Asset | Budget |
|---|---|
| House or workshop or granary, finished | 12,000 / 3,000 / 500 (shipped `house_c` 10,150 / 1,558 / 278) |
| Any foundation or frame stage | 4,000 / 2,000 / 600 (shipped `house_c` s0 838 / 122 / 122, s1 2,182 / 1,202 / 554) |
| Temple (hero asset, one instance) | shipped 14,838 / 2,068 / 560: individual roof planks, stone blocks, battens |
| Well | 1,500 / 500 / 250 (shipped 1,382 / 410 / 206) |
| Fence segment, stockpile | 400 each, single LOD (shipped 156 and 308) |
| Villager | 300 (GLB up to 400), single LOD |

About 60 buildings are drawn at once, with up to 200 villagers.

## Villager

Segmented toy figure, **no armature**: the vertex shader swings rigid parts about their joints (walk, work, pray, idle, carry). About 1.6 m tall, feet at y = 0, facing +Z, arms hanging. Separate meshes named `torso`, `head`, `arm_l`, `arm_r`, `leg_l`, `leg_r` (optional `tool`, held in the right hand), **each with its origin at its joint** (hip for legs, shoulder for arms, neck for the head, hip for the torso). Mark the tunic in a material named `tunic`; it is tinted per villager. Use the placeholder (`villagerFigure.ts`, 180 triangles) as the size reference.

## Making and shipping an asset

Sources live in `assets-src/village/` (not shipped). The temple is generated by script so it can be rebuilt and tweaked by parameter:

1. In Blender (MCP or the Python console):
   ```python
   root = r"<repo>/assets-src/village"
   tb, at = {}, {}
   exec(open(root + "/temple_build.py").read(), tb)
   exec(open(root + "/village_atlas.py").read(), at)
   tb['make'](r"<repo>/public/models/village-kit", at, root + "/village_atlas.png")
   ```
   This paints the atlas, builds the three LODs and the glow mesh, and writes `temple*.gltf` with PNG sidecars. `tb['preview'](path)` renders a check image.
2. Bake each file to KTX2 (`--no-lod`: the LODs are already authored), then delete the sidecars:
   ```bash
   for f in temple temple_lod1 temple_lod2 temple_glow; do node scripts/bake-play-props.mjs --one public/models/village-kit/$f.gltf --no-lod --keep-sources; done
   rm public/models/village-kit/*.gltf public/models/village-kit/*.bin public/models/village-kit/*.png
   ```
   Glow meshes use two materials: `tpl_glow` (cyan, keeps `TEMPLE_RUNE_DAY_GLOW` by day) and `tpl_glow_warm` (dusk only like house windows); the game picks by the `warm` in the material name, the colour is the vertex colour.
3. Houses: in Blender run `tb, hb = {}, {}`, `exec(open(root + '/temple_build.py').read(), tb)`, `hb['tb'] = tb`, `exec(open(root + '/house_build.py').read(), hb)`, `ns = hb['house_atlas'](root)`, then `hb['make'](r'<repo>/public/models/village-kit', ns, root + '/village_house_atlas.png', kinds=('house_a', 'house_b'))` (it exports every stage and LOD plus the glow for each kind). For workshop, granary and well also `exec(open(root + '/village_extra_build.py').read(), hb)` before `make`. If the atlas changes, re-export and re-bake every kind: the loader keeps one copy per texture name, bake each file as in step 2 (`house_c_s0 … house_c_s2_lod2`, `house_c_glow`), and delete the sidecars.
4. Add the key to `KIT` in `villageKit.ts` (`type` when the file carries building metadata, `single` when it has no LOD siblings), then `npm run village:check` (the headless sim reads the same extras).
