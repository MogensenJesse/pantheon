# Village textures

One trim sheet serves every building (temple, three houses, workshop, granary, well, fence, stockpile): **`village_atlas.png`, 1024 × 2048 px, 15 horizontal strips.** Each strip is one surface type and spans the full width. The strips are painted PNGs in `textures/` (the v3 set: moss turf, straw thatch, fish-scale shingles, planks, stone, carved knotwork, ...); `paint_atlas` in `village_atlas.py` reads them, adds the 16 px gutters and falls back to a numpy stand-in for any missing file. `village_atlas.png` is that result, `texture_template.png` shows where each strip sits. The strip table in `village_atlas.py` (`STRIP_SPECS`) is the source for every number below.

## Rules

- **Albedo only.** The game multiplies the texture by vertex colour (baked ambient occlusion and a little per-face tone) and lights it itself. Normal, roughness and AO maps are ignored. Do not paint cast shadows or light direction.
- **Every strip tiles left-right** (the right edge continues into the left edge).
- **Top of the image = up**: up the wall, up the roof slope, and on boards the side facing up.
- Paint at 1×, 2× or 4× the px size (same aspect ratio), I downscale. Keep a strip's mid-tones mid: the AO and the sun do the contrast.
- Strips marked *stacked* are laid in bands on roofs, one band = one strip height, so the top of the strip must continue into the bottom (turf) or end in a visible step (thatch, shingle).

## The 15 strips

| Strip | px (w × h) | Covers | Tiling | Used on | Look |
|---|---|---|---|---|---|
| `wall` | 1024 × 192 | 6.0 m across, stretched over the wall | left-right | temple walls and gable triangles, far-LOD walls of every house | dark upright planks, about 30 boards across, dark gaps |
| `plank` | 1024 × 96 | 2.4 m along one board, one 0.2 m board across | left-right | wall boards, doors, steps, decks, ladder, barrels, log sides, fence rails | single board: grain along the length, darker top and bottom edge |
| `beam` | 1024 × 64 | 2.0 m along, one 0.2-0.3 m timber across | left-right | posts, frames, rafters, rake boards, X boards, dragon heads, temple timbers, fence posts | dark timber with lengthwise grain |
| `trim` | 1024 × 64 | 2.0 m along, 0.2 m across | left-right | frames, sills, log ends, door frames, carved-panel borders | lighter weathered wood |
| `stone` | 1024 × 128 | 4.0 m across, **0.5 m high = two rows of flat stones** | left-right, rows stack | footing band, chimney courses, well ring, terrace blocks; also stretched over forge, granary feet, flagstones | flat grey fieldstones, dark mortar, mortar line on the top and bottom edge |
| `turf` | 1024 × 256 | 8.0 m across, 2.0 m high | **left-right and up-down** (stacked) | roofs of house A, house C, workshop, hall skirt | olive grass: clumps, blade streaks, dry yellow patches, darker hollows |
| `soil` | 1024 × 64 | 3.0 m across, stretched over the 0.28 m turf edge | left-right | turf roof edges and undersides | dark earth with roots; the top 40% fades into the grass green |
| `thatch` | 1024 × 128 | 5.0 m across, 0.625 m high = **one course** | left-right, stacked | roofs of house B, granary, well | straw lines running downhill, shadow band at the top (tucked under the course above), ragged shadowed foot |
| `shingle` | 1024 × 128 | 3.2 m across, 0.4 m high | left-right, stacked | temple and belfry roofs (also stretched over far-LOD roofs) | dark fish-scale shingles: 4 rows of 0.2 m scales (64 px), every second row shifted half a scale, dark rim under each scale |
| `shingle_alt` | 1024 × 128 | same as `shingle` | left-right, stacked | the other half of the shingle courses | a second shingle pattern: each roof course picks `shingle` or `shingle_alt` (from its texture shift), so the roof does not show one repeating band |
| `carve` | 1024 × 96 | 3.0 m along a board, one 0.3 m board across | left-right | temple and belfry carved friezes (stacked 0.3 m high) | red-brown carved board with light knotwork (interlace) |
| `rune` | 1024 × 64 | 2.4 m across, one plate | left-right | rune plates on the temple gables | dark wood plate with rune grooves every 0.3 m |
| `dark` | 1024 × 32 | 1.5 m across | left-right | door bands, hinges, flues, forge mouth | iron / charred black |
| `horn` | 1024 × 48 | 1.0 m along the horn, 0.2 m across | left-right | bull horns on house B | ivory-grey horn, fine ridges |
| `rope` | 1024 × 32 | 1.2 m along, 0.05 m across | left-right | well windlass | twisted rope |

## What each model uses

| Model | Strips |
|---|---|
| temple | `shingle`, `shingle_alt`, `wall`, `beam`, `trim`, `stone`, `carve`, `rune`, `dark` |
| house A (turf) | `turf`, `soil`, `wall`, `plank`, `beam`, `trim`, `stone`, `dark` |
| house B (thatch, horns) | `thatch`, `horn`, `wall`, `plank`, `beam`, `trim`, `stone`, `dark` |
| house C (turf, dragons) | `turf`, `soil`, `wall`, `plank`, `beam`, `trim`, `stone`, `dark` |
| workshop | `turf`, `soil`, `wall`, `plank`, `beam`, `stone`, `dark` |
| granary | `thatch`, `wall`, `plank`, `beam`, `trim`, `stone`, `dark` |
| well | `thatch`, `stone`, `plank`, `beam`, `rope`, `dark` |
| fence, stockpile | `beam`, `plank`, `trim` |

## Using your own strips

Put `<strip>.png` (opaque RGB, exactly the px size above) in `assets-src/village/textures/`, or point the `VILLAGE_TEXTURES_DIR` environment variable at another folder, then run the make steps in `public/models/village-kit/README.md` (export, KTX2 bake, delete sidecars). A strip with the wrong size stops with an error naming the file; a missing file falls back to the numpy stand-in. Every GLB embeds the atlas (about 0.32 MB as ETC1S KTX2, the loader keeps one GPU copy), so a texture change means re-baking all 58 files.
