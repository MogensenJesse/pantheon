# Builder (man): base model for the villager kit

Base is the Codex v2 model (`README.codex.md`): one skinned mesh, one painted atlas, 29 bones, three clips. It is
refined one view at a time against the style sheet so the other villagers can follow the same recipe.

| File | What it is |
|---|---|
| `builder_m_codex_v2.blend` | Untouched Codex v2 source. Never edited; every step starts from it. |
| `builder_m.blend` | Current refined model (output of `refine_builder.py`), open this one. |
| `builder_m_soft.blend`, `soften_builder.py` | Experiment on a duplicate (the checkpoint stays untouched): the ears are extruded from the head's side faces as tapered leaves (the nose stays the separate pyramid) and a Smooth modifier (0.25 x 1, `Soften`) sits before the armature. Flat shading kept. Rebuild: `blender --background --python soften_builder.py` (opens `builder_m.blend`, writes `builder_m_soft.blend`). |
| `builder_m_white.blend`, `fit_white.py` | The untextured working model adapted to the white 3D reference (cut-outs of it are not kept in the repo). Starts from `builder_m_soft.blend` (never modified): texture removed (the material has no image node; the Codex atlas stays in the file with a fake user), detail geometry added, new cap and nose. Rebuild: `blender --background --python fit_white.py`. |
| `white_compare.png`, `white_head.png` | Reference | model | silhouette overlay for front, back, side; and the head from four angles. |
| `refine_builder.py` | The refinement, all steps in one script. Only vertex positions change (plus two extra rings in the head and three in the cap), so UVs, weights, rig and clips stay valid. |
| `ref_side.png`, `ref_front.png`, `ref_back.png` | The side, front and back references cut from the sheet (the tools in `../tools/` render the model at their scale). |
| `turntable.png`, `texture_gaps.png` | The eight-angle contact sheet and the texture gaps (see below). |
| `builder-basecolor.png`, `builder-uv-layout.svg`, `texture-generation-prompt.txt` | Atlas, its UV layout, the prompt that made it (Codex). |

Rebuild: `blender --background --python refine_builder.py` (writes `builder_m.blend` next to it).

## Steps

1. **Side view (done).** The reference is the side figure of the sheet (`ref_side.png`, 532 x 812 px, 1.782 m, feet at row
   725). The Codex model was about 25 % too thin front to back (head 0.32 m deep against 0.48, torso 0.37 against 0.45).
   `PROFILES` in the script hold, per part and height, the front and back edge read off the drawing in pixels; each
   ring of the part is remapped onto them (`remap_depth`). Cap: outline polylines plus a tilt back (front rim up 5.6 cm,
   back rim down 10 cm) so it sits like the beanie; face rings and nose lifted 3 to 4.5 cm so brows and eyes keep the
   drawing's gap under the cap. Silhouette now within about 2 cm of the drawing everywhere except the hammer and the
   hanging apron flap.
2. **Front view (done).** Reference: the front figure (`ref_front.png`, 440 x 640 px, centre column 225.5, feet row 628,
   317.6 px/m). The arms are compared in the Idle pose (clip frame 1), which hangs like the drawing; the A-pose rest
   pose does not. `WIDTHS` hold half widths per ring: head with a tapered chin, cap narrowed 2 cm a side, wider
   shoulder yoke (collar ring up to z = 1.30, `TORSO_Z_MAP`), flared apron, wider legs and boots that splay outward.
   Arms (second pass): the Codex arms were already the drawing's thickness (sleeve 0.23 m, forearm 0.16 m; the first
   pass widened them by mistake from a silhouette that included plank and hammer), so only the sleeve is trimmed to
   x0.95. The drawing has SHORT forearms and BIG fists (forearm 0.15 m against 0.31, fist 0.21 against 0.185): the
   forearm is compressed along its axis (`shorten_forearm`), the hand carried up and lengthened, bent 20 degrees in at
   the wrist (`bend_wrist`, smooth over the first 10 cm, thumb kept upright) and the whole arm moved out 6 to 13 cm
   (`ARM_SHIFT`; the drawing's elbows stand out). The rig bones are NOT moved yet: pivots of elbow and wrist sit
   about 10 cm off the mesh, to be re-aligned when the clips are redone. Nose rebuilt (taller, 25 % wider). The tunic
   skirt sits behind the apron.
   Both silhouettes are within about 2 cm of the drawing except plank, hammer and the hanging apron flap.
3. **Back and three-quarter (done).** Back reference: the back figure of the sheet (`ref_back.png`, centre column 210, feet
   row 626); `front_render.py --view back` renders the model to the same scale. The back and the front both end
   within 1.2 cm mean edge error (plank and hammer rows left out), the shoulder corner was 4 cm narrow and is fixed: the arm cap is lifted (`lift_shoulder`) and the torso shoulder ring is 0.31 half wide at z = 1.252 so the shoulder line runs on into the sleeve. Collar
   top raised to z = 1.32 (`TORSO_Z_MAP`) with a narrow collar ring so the neck base reads as drawn. `turntable.png`
   shows eight angles; the drawing has no three-quarter view, so that one is judged for consistency only. Shape is
   done; what is left is texture, see the list below.
4. **Texture: the gaps, nothing changed yet.** The Codex atlas projects every part from the front only, so the sides, tops
   and undersides of the limbs, head and boots collapse onto one column of atlas pixels: 68 of 714 faces, 25 % of the surface
   (magenta in `texture_gaps.png`; measured with `../tools/uv_audit.py`). Visible ones: the head sides (temple and the area
   round the ears, a dark patch instead of skin and hair), the back of the head (hair should reach the nape, the painted band
   moved up with the face lift), the cap crown, the torso flanks between arm and body, the shoulder tops and collar shelf,
   the boot toe tops, palms and undersides of the hands, the soles. Hidden ones: tops and bottoms of the other parts. The
   texture itself is untouched (an attempt to re-unwrap and project the drawings onto a new layout was rejected and removed).
5. Export (`../export_villager.py`), clips, game plumbing.

Tools in `../tools/`: `side_render.py` and `front_render.py` (silhouette or lit render at the sheet's scale, for overlays), `wire_render.py`, `pose_render.py`, `turntable.py` (angle sheets), `uv_audit.py` (texel density, collapsed UVs), `uv_debug_render.py` (collapsed faces in magenta).

## White reference adaptation (builder_m_white.blend)

Reference: a white, untextured 3D render of the builder with front, back and side cut-outs (854 x 1175 px, about 603 px per
metre, centre line at column 450 front / 417 back, spine axis at column 439 side). The body silhouette from steps 1 to 3
already matched it to 1 to 3 cm (outside the hammer and plank, which are not part of the body), so the work was detail
geometry that the old texture only painted, added by `fit_white.py` (all new pieces are weighted like the body under them,
have placeholder UVs, and are left out of the Smooth modifier through the vertex group `soften_mask`):

- belt z 0.77 to 0.835, a band round the torso (radial, 1.8 cm proud);
- shoulder straps: front z 1.07 to 1.27, over the shoulder, down the back to the plate's top corners;
- raised back plate z 0.845 to 1.115;
- pocket (pentagon, point at z 0.53) and two tool straps hanging from the belt;
- new cap: a thin band whose lower edge is sheared (front 1.65, sides 1.585, back about 1.51) with a stepped dome and a
  narrow crown (`CAP_RINGS`, 12 segments); the band face stays upright because the slope is a shear, not a rotation;
- new nose (still a separate shell): 3.4 to 4.2 cm bridge, tip 6.6 cm out, flared base 9.6 cm wide;
- brow ridges, eyes and mouth as thin raised bars (`add_face_lines`);
- apron front panel flattened a little.

Face step (`reshape_head`, `HEAD_SHAPE`, `HEAD_Z`, `JAW_RISE`): each head ring gets its own half width and front/back
depth so the forehead is flat, the jaw tapers to a narrow chin and the jaw underside rises toward the ear; the ears (the two
outermost vertices per side of each ear row) keep their offset. The top ring is raised to z 1.70 and pulled in under the
cap, and the back rings are pulled in, so no head, ear, nose, brow or face-line vertex touches the cap (BVH overlap = 0,
checked with scratch scripts, not in the repo). A chevron cap edge (lower edge dropping toward the sides, as the front
view of the reference shows) was tried and brought the clipping back, so it is left out. Silhouette against the side
reference is within 1 to 3 cm except the cap front at z 1.62 (4 cm behind).

Not done: the V-neck, truly faceted face planes (the head still reads rounder than the reference, partly the Smooth
modifier, partly ring banding; the jaw is curved, not one straight chamfer), the apron's old overlapping shell pieces
(they still show as a patchwork), arm and sleeve volumes (the reference's arms are posed holding the props), the hammer
and plank. 2,350 triangles (was 1,618). Placeholder UVs: the next texture pass re-unwraps.
