# Village kit (Blender brief)

The village currently draws a **code-generated placeholder kit** (`src/world/village/assets/placeholder/`). This document is the brief for replacing it with modelled assets. The loader that swaps GLBs in through a `manifest.json` is **not written yet**; it is built together with the first real asset. Until then the numbers below are the contract the placeholders already follow, checked by `node --experimental-strip-types scripts/village-kit-check.ts`.

## Conventions (every asset)

- Metres, glTF Y-up. **Origin at the base centre of the footprint, y = 0 at the floor.** The door faces local **+Z** (Blender: −Y).
- The footprint is the inside of the walls; roofs may overhang it. Nothing below y = 0 except hidden foundations.
- **Normals exported.** The shipped `nordic-hut` / `stave-church` GLBs have none and shade flat; do not repeat that.
- Colour: vertex colours (`COLOR_0`) multiply the albedo, so a vertex-coloured mesh with a white material works (the placeholder does exactly this). Textures, if used, are KTX2.
- Three LOD files per asset: `<key>.glb`, `<key>_lod1.glb`, `<key>_lod2.glb`, each with the **same number of submeshes**.
- Material names are classified by substring: avoid `leaf`, `leaves`, `needle`, `bark`, `trunk`, `flower`, `petal`, `plant`, `bush`, `clover`, `mushroom` unless foliage shading is wanted. Suggested names: `wood`, `stone`, `thatch`, `plaster`, `window`, `window_glow`.
- Empties (optional metadata): `door`, `chimney` (top of the flue), `work_0` … `work_3` (builder standing spots).

## Asset keys

A building is built through stages, each its own mesh with the same footprint and origin:

| Key | Stages | Footprint (m) | Height (m) |
|---|---|---|---|
| `village_house_a_s0` `_s1` `_s2` | foundation, frame, finished | 5 × 4 | 4.5 |
| `village_house_b_s0` `_s1` `_s2` | | 6 × 4.5 | 4.8 |
| `village_house_c_s0` `_s1` `_s2` | | 7 × 5 | 5.2 |
| `village_workshop_s0` `_s1` `_s2` | open front | 6 × 5 | 4.6 |
| `village_granary_s0` `_s1` `_s2` | on 0.9 m stone feet | 3.2 × 3.2 | 4.3 |
| `village_temple_s2` | finished only | 9 × 13 | 12.2 |
| `village_well_s2` | finished only | 2.2 × 2.2 | 2.7 |

Stage 0 is a low foundation (≤ 0.5 m), stage 1 the timber frame with an open roof, stage 2 the finished building. `village_<type>_glow` (house, workshop, temple) is a separate set of flat quads just in front of the windows, coloured warm (vertex colour); the game draws it additively at night. Keep real window panes dark in the main mesh.

Small pieces: `village_plinth` (unit cube, pivot at the bottom centre, scaled to each pad), `village_steps` (4 steps dropping 1 m over 1.6 m, top step at z = 0), `village_fence` (2 m segment along local X), `village_crop_a` (gold stalks) / `village_crop_b` (green), `village_stockpile` (about 1.6 × 0.8 × 0.6 m).

## Triangle budgets (lod0 / lod1 / lod2)

| Asset | Budget |
|---|---|
| House or workshop or granary, finished | 800 / 300 / 40 |
| Any foundation or frame stage | 800 / 400 / 120 |
| Temple | 1500 / 600 / 80 |
| Well | 200 / 120 / 80 |
| Fence segment | 60 / 40 / 40 |
| Crop | 40 each |
| Villager | 300 (GLB up to 400), single LOD |

About 60 buildings are drawn at once, with up to 200 villagers.

## Villager

Segmented toy figure, **no armature**: the vertex shader swings rigid parts about their joints (walk, work, pray, idle, carry). About 1.6 m tall, feet at y = 0, facing +Z, arms hanging. Separate meshes named `torso`, `head`, `arm_l`, `arm_r`, `leg_l`, `leg_r` (optional `tool`, held in the right hand), **each with its origin at its joint** (hip for legs, shoulder for arms, neck for the head, hip for the torso). Mark the tunic in a material named `tunic`; it is tinted per villager. Use the placeholder (`villagerFigure.ts`, 180 triangles) as the size reference.

## Planned manifest (not implemented)

```json
{
  "assets": { "village_temple_s2": { "file": "temple.glb", "footprint": [9, 13] } },
  "villager": { "file": "villager.glb" }
}
```

Any key present overrides the placeholder; absent keys keep it, so the kit can be replaced piece by piece.
