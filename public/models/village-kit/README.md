# Village kit (Blender brief)

The village draws a **code-generated placeholder kit** (`src/world/village/assets/placeholder/`) for every key that has no modelled GLB here yet. Modelled files in this folder replace their key at load (`src/world/village/assets/villageKit.ts`, table `KIT`); missing files keep the placeholder, so the kit can be replaced piece by piece. Placeholder numbers are checked by `npm run check:village-kit`.

**Status:** the GLBs in this folder are the **restyled kit** with organic full detail (swayback roofs, bowed timbers, see below), baked 2026-10-13 with the painted atlas (`assets-src/village/textures/`, the v3 set; `assets-src/village/TEXTURES.md` lists the 15 strips of the one shared atlas). The style comes from the sheet: turf (moss) and thatch roofs with thick edges, crossed rake boards (plain, horned, dragon heads), dark plank walls on flat grey footings, tapered stone chimneys, a stave-church temple. Footprints, doors, work slots, glow files, stages and LODs are unchanged from the previous kit, so the village smoke fingerprints did not move. Exception: the temple grew from 15.6 to 18.9 m and its `crownY` (the orb height) moved from 17.0 to 20.6 m, because the orb now hovers above a belfry spire. All 58 files weigh 26 MB together: every file embeds the 1024 × 2048 atlas (ETC1S KTX2, about 0.32 MB) and the loader keeps one GPU copy.

**Models** (all built by script; stages and LODs are listed under Asset keys, glow meshes keep their lights):

- **Temple** (14 x 14 m terrace, 18.9 m): stepped stone terrace with stairs, four gabled portal arms with carved portals, a core with carved friezes, dark fish-scale roofs laid in stepped courses with timber ribs, dragon-head finials on every gable, a central belfry (carved panels, steep scale roof, spire) under the player's orb. Cyan rune glow lines (dim by day) and the warm door, slit and corner-lantern lights live in the glow mesh. Triangles 14,962 / 2,152 / 564, glow 274 / 166 / 126.
- **House C** (the hall, 7 x 6 m footprint: hall 7 x 4.8 m plus a 1.2 m porch): turf roof (lumpy blanket, grass fringe and tufts), carved dragon heads on the front rake boards, upright dark planks, a turf skirt on posts along the front right, a closed porch with its own cross-gable and a swung-open door, a gable-end bay, a tapered stone chimney (smoke point in the extras), no dormer. Triangles 8,336 / 1,926 / 506.
- **House A** (5 x 4 m, no porch): turf roof, plain crossed rake boards curling up, laid boards with upright gable boards, closed banded door with two steps, one window beside it, tapered chimney. 4,982 / 1,236 / 274.
- **House B** (6 x 5 m): thatch roof (stepped courses, straw ends hanging off the eaves), bull horns on the rake boards, an open porch on two thick pillars with a cross-gable, half-timbered gable, a big tapered chimney. 6,430 / 1,946 / 506.
- **Workshop** (5 x 6 m, the open gable end is the front: two thick posts on stone footings, a header with braces): turf roof, upright boards, plain crossed rake boards, a tapered stone chimney over the forge; inside a stone forge with its fire in the glow mesh, anvil on a stump, workbench, stool, weapon rack, barrels, crate. 6,078 / 1,044 / 330.
- **Granary** (3.2 x 3.2 m, four stone feet 0.9 m high, door in the gable end with a ladder, no glow): thatch roof, timber bargeboards with flared ends. 3,434 / 1,004 / 512.
- **Well** (2.2 x 2.2 m, finished only): round stone ring in three courses on a plank apron, two posts, windlass with rope, bucket and crank, a small thatch canopy. 1,566 / 642 / 310.
- **Fence** (2 m segment: two round posts, two round rails, 192 triangles) and **stockpile** (a pyramid of six logs, about 1.7 x 0.9 x 0.8 m, 360 triangles); single LOD.

**Organic full detail** (lod0 only; `Builder.organic` is false for LOD1 and LOD2, which stay straight and keep their budgets): the roofs sag like a swayback (a slope is steepest at the ridge, flattens toward the wall line and flicks up over the overhang, `ROOF_SAG` about 5% of the slope), the ridge dips along its length, the turf and thatch surface has soft lumps and a few dents, the eave edge is uneven, and the rake boards follow the same curve. Long timbers bow sideways and up by up to 1.2% of their length and taper (`BOW`, `beam()`), wall and gable boards are a little proud, deep and leaning, posts, fence posts, the chimney stack and the logs lean, stones are rough. The gable walls and boards end just under the sagging roof (`gable_edge`), so nothing pokes through. Tune in `temple_build.py` (`BOW`, `ROOF_SAG`, `ROOF_SAG_MAX`, `RIDGE_DIP`, class `RoofShape`) and `house_build.py` (`ROOFS[...]`: lump, dents, wave); the roof surfaces carry their own UVs (`Builder.face_uv`, the `preuv` layer) so the texture runs on whatever the cut.

Built by `assets-src/village/temple_build.py` (temple, the shared `Builder` and region table, `banded_slab`), `house_build.py` (house plans in `SPECS`: roof kind, rake-board tips, wall direction, porch, skirt, chimney), `village_extra_build.py` (workshop, granary, well, fence, stockpile, the showcase file) and `village_atlas.py` (the atlas strips, the loader for the painted strips in `assets-src/village/textures/` (or `VILLAGE_TEXTURES_DIR`) with numpy stand-ins as fallback, and the UV pass). Roofs are laid in bands one atlas strip high (`banded_slab`; the strips are metric, see `STRIP_SPECS`), so big planes never stretch a texture, and a per-face U shift (`uoff`) breaks up repeats; the far LODs use flat bands or stretched strip aliases (`shingle_far`, `stone_fit`).

## Conventions (every asset)

- Metres, glTF Y-up. **Origin at the base centre of the footprint, y = 0 at the floor.** The door faces local **+Z** (Blender: −Y).
- The footprint is the inside of the walls; roofs may overhang it. Nothing below y = 0 except hidden foundations.
- **Normals exported.** The shipped `nordic-hut` / `stave-church` GLBs have none and shade flat; do not repeat that.
- Colour: vertex colours (`COLOR_0`) multiply the albedo, so a vertex-coloured mesh with a white material works (the placeholder does exactly this). Textures, if used, are KTX2.
- Three LOD files per asset: `<key>.glb`, `<key>_lod1.glb`, `<key>_lod2.glb`, each with the **same number of submeshes**.
- Material names are classified by substring: avoid `leaf`, `leaves`, `needle`, `bark`, `trunk`, `flower`, `petal`, `plant`, `bush`, `clover`, `mushroom` unless foliage shading is wanted. Suggested names: `wood`, `stone`, `thatch`, `plaster`, `window`, `window_glow`.
- **Metadata as glTF extras** on the building node (Blender custom properties, exported with *Include → Custom Properties*), in glTF axes (x, z = Blender x, −y): `footprint` `[w, d]` (inside of the walls, used for planning and the level pad), `door` `[x, z]`, `workSlots` `[[x, z], …]`, optional `chimney` `[x, y, z]`, optional `crownY` (height of the orb the game hovers on the building's axis). Empties do not survive the bake (its prune step drops them).
- **Textures:** one shared trim-sheet atlas for every building (`assets-src/village/village_atlas.png`, 1024 × 2048, 15 horizontal strips that span the full width: U repeats, V stays inside the strip; the strips and their sizes are in `assets-src/village/TEXTURES.md`). The loader keeps one copy per texture name, so the whole village costs one texture. The painted colours are dark and the props' noon shadow floor is 0.12, so the game grades the textured kit materials: `VISUAL.village.KIT_LOOK` lifts the sun-shadowed sides (`SHADE` 0.5) and multiplies the colours (`GAIN` 1.4); live in the console with `__pantheonVillage.kitLook({ shade, gain })`.
- **LODs are authored** (the bake's automatic simplify cannot reduce flat-shaded meshes: every edge is a UV seam).

## Asset keys

A building is built through stages, each its own mesh with the same footprint and origin:

| Key | Stages | Footprint (m) | Height (m) |
|---|---|---|---|
| `village_house_a_s0` `_s1` `_s2` | foundation, frame, finished | 5 × 4 | 5.6 |
| `village_house_b_s0` `_s1` `_s2` | | 6 × 5 (modelled, porch included) | 6.0 |
| `village_house_c_s0` `_s1` `_s2` | | 7 × 6 (modelled, porch included) | 6.6 |
| `village_workshop_s0` `_s1` `_s2` | open front | 5 × 6 (modelled, front = gable end) | 6.5 |
| `village_granary_s0` `_s1` `_s2` | on 0.9 m stone feet | 3.2 × 3.2 | 6.1 |
| `village_temple_s2` | finished only | 14 × 14 (stone terrace; cruciform temple on it) | 18.9 |
| `village_well_s2` | finished only | 2.2 × 2.2 | 3.4 |

Stage 0 is a low foundation (≤ 0.5 m), stage 1 the timber frame with an open roof, stage 2 the finished building. `village_<type>_glow` (house, workshop, temple) is a separate set of flat quads just in front of the windows, coloured warm (vertex colour); the game draws it additively at night. Keep real window panes dark in the main mesh.

Small pieces (single LOD, no stages): `village_fence` (2 m segment along local X: two round posts and two round rails; `fence.glb`) and `village_stockpile` (a pyramid of six logs, about 1.7 × 0.9 × 0.8 m; `stockpile.glb`). Both built by `village_extra_build.py` (`make_pieces`). `assets-src/village/village_models.blend` stands every model in one row, textured with the stand-in atlas (`make_showcase` rebuilds it from the scripts; a snapshot, the game never reads it; `temple.blend` is the temple's older hand-kept snapshot and no longer a source). `village_steps` is not used by the game. There are no crop meshes: wheat in the fields is grass (the grass data map's B channel marks the plot; see AGENTS.md).

## Triangle budgets (lod0 / lod1 / lod2)

| Asset | Budget |
|---|---|
| House or workshop or granary, finished | 12,000 / 3,000 / 500 (organic `house_c` 8,336 / 1,926 / 506) |
| Any foundation or frame stage | 4,000 / 2,000 / 600 (`house_c` s0 902 / 122 / 122, s1 3,278 / 1,202 / 554) |
| Temple (hero asset, one instance) | organic 14,962 / 2,152 / 564: stepped shingle courses, stone blocks, battens |
| Well | 1,500 / 500 / 250 (organic 1,566 / 642 / 310: slightly over, and the LODs already were) |
| Fence segment, stockpile | 400 each, single LOD (organic 192 and 360) |
| Villager | 1,200, single LOD (`villagers.glb`: 828 to 1,196; placeholders 180 to 252) |

About 60 buildings are drawn at once, with up to 200 villagers.

## Villager

`villagers.glb` holds all twelve figures (six roles x two sexes), built by `assets-src/village/villager_build.py` from the user's style sheets (chunky Norse settlers, about 4 heads tall); the optional `--blend` argument saves a snapshot (none is kept in the repo). Rebuild:

```
blender --background --factory-startup --python assets-src/village/villager_build.py -- --glb public/models/village-kit/villagers.glb [--preview <dir>] [--blend <path>]
```

Segmented toy figures, **no armature**: the vertex shader swings rigid parts about their joints (idle, walk, hammer, pray, carry, chop, hoe, fish). Feet at y = 0, facing +Z, arms hanging. Each figure is a node `villager_<role>_<m|f>` (role = builder, priest, idler, farmer, woodcutter, fisherman) with one child per rig part; the child sits at its joint and carries extras `part` (`Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`, `Tool` for the work roles, hanging from the hand and shown only while working, `Staff` for priests, hidden while praying) and `pivot` (figure space). The pivots must match `VILLAGER_RIG` in `villagerFigure.ts`. Materials are flat colours, except the slots `villager_skin`, `villager_hair` and `villager_tunic`, which the game tints per villager. Back loads (basket, logs, net) belong to the torso. The game reads no UVs or textures from this file; the placeholders in `villagerFigure.ts` stand in for any figure the file lacks. `npm run check:village-kit` (kit check) verifies parts, slots, triangles and height of every figure.

## Making and shipping an asset

Sources live in `assets-src/village/` (not shipped). Every model is generated by script so it can be rebuilt and tweaked by parameter:

1. In Blender (MCP or the Python console):
   ```python
   root = r"<repo>/assets-src/village"
   out = r"<repo>/public/models/village-kit"
   tb, hb, at = {}, {}, {}
   exec(open(root + "/temple_build.py").read(), tb)
   hb['tb'] = tb
   exec(open(root + "/house_build.py").read(), hb)
   exec(open(root + "/village_extra_build.py").read(), hb)
   exec(open(root + "/village_atlas.py").read(), at)
   atlas = root + "/village_atlas.png"
   tb['make'](out, at, atlas)                                   # temple, 3 LODs + glow
   hb['make'](out, at, atlas, kinds=('house_c', 'house_a', 'house_b', 'workshop', 'granary', 'well'))  # every stage and LOD + glow
   hb['make_pieces'](out, at, atlas)                            # fence, stockpile
   hb['make_showcase'](root + "/village_models.blend", at, atlas)
   ```
   This builds the atlas from the painted strips (see `TEXTURES.md`), builds every model and writes `*.gltf` with PNG sidecars. `tb['preview'](path)` renders a flat-colour check image. `make_showcase` empties the scene and saves the .blend, so run it last.
2. Bake each file to KTX2 (`--no-lod`: the LODs are already authored), then delete the sidecars:
   ```bash
   for f in public/models/village-kit/*.gltf; do node scripts/bake-play-props.mjs --one "$f" --no-lod --keep-sources; done
   rm public/models/village-kit/*.gltf public/models/village-kit/*.bin public/models/village-kit/*.png
   ```
   Glow meshes use two materials: `tpl_glow` (cyan, keeps `TEMPLE_RUNE_DAY_GLOW` by day) and `tpl_glow_warm` (dusk only like house windows); the game picks by the `warm` in the material name, the colour is the vertex colour.
3. The loader keeps one copy per texture name: when the atlas changes, re-export and re-bake every file (steps 1 and 2 for all kinds).
4. Add the key to `KIT` in `villageKit.ts` (`type` when the file carries building metadata, `single` when it has no LOD siblings), then `npm run check:village-kit` (the headless sim reads the same extras).
