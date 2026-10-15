# Builder — textured version 2

This version moves most small surface details into a painted base-color texture and uses a simpler silhouette mesh. The first version is preserved separately.

## What changed

| | Version 1 | Version 2 |
|---|---:|---:|
| Character triangles | 3,354 | **1,450** |
| Character mesh objects | 47 | **1** |
| Source vertices | 1,786 | **763** |
| Rig bones | 29 | **29** |
| Demo animation clips | 3 | **3** |

Triangle reduction: **56.8%**. The character now exports as one mesh primitive with one material and one embedded base-color atlas.

The eyes, brows, mouth, hair, upper apron, shoulder straps, rivets, belt, buckle, pocket, hanging leather loop and cloth color planes are painted details. The model retains geometry for the face and nose profile, ears, cap outline, body and limb volumes, hands, boots and the flexible lower apron. The face and cap use broader, more angular planes to follow the supplied drawings more closely. Sleeves and boot cuffs are integrated into their limb meshes instead of overlapping separate objects.

The lower apron still has a thin mesh and three rig controls so it can lift away from the legs. Painting the entire hanging apron onto the trousers would prevent that independent movement.

## Files

- **builder-textured-v2.blend** — editable Blender source with packed texture, rig, all three actions and the packed turnaround reference.
- **builder-textured-v2.glb** — portable character with the embedded texture, skin and animations.
- **builder-basecolor.png** — generated 1448 × 1086 base-color texture atlas.
- **builder-uv-layout.svg** — UV placement overlay. Some islands intentionally share the same chart, including mirrored limbs and the torso/lower-apron front.
- **hammer.glb**, **plank.glb** — separate textured accessories; 88 and 44 triangles respectively.
- **builder-preview.png** — actual three-quarter model render.
- **v1-v2-comparison.png** — both actual models rendered together at the same scale.
- **builder-front.png**, **builder-back.png**, **builder-side.png** — orthographic views.
- **builder-walk.gif**, **builder-arm-motion.gif** — motion previews.
- **builder-walk-test.png**, **builder-arm-test.png** — posed stills.
- **model-report.json**, **validation-report.json** — geometry and export verification.
- **texture-generation-prompt.txt** — exact prompt used with built-in image generation. The source drawings and a UV placement guide controlled the atlas layout.

## Using and editing it

Open the Blender file and press Space to play the active **Idle** action. Select **Builder_RIG** and use Pose Mode to pose the character. In the Dope Sheet's **Action Editor**, switch between **Idle**, **Walk_in_place** and **Hammer_gesture**. Idle and Hammer_gesture run on frames 1–49; Walk_in_place runs on frames 1–33 at 24 fps. Switch the armature to Rest Position to inspect the underlying A-pose.

The rig uses forward kinematics. The grouped fingers and thumbs have their own controls; individual fingers are not modeled. **apron.C**, **apron.L** and **apron.R** control the lower apron. The source opens with the studio hidden in the modeling viewport, while it remains available for rendering.

Paint the supplied PNG using the UV layout as a guide, then reload or replace the packed image in Blender's Image Editor. The material uses the atlas directly as its base color, so no normal map or separate texture dependency is required. The atlas has four columns and three rows:

| | Column 1 | Column 2 | Column 3 | Column 4 |
|---|---|---|---|---|
| Top row | Face | Torso/apron front | Torso back | Cap |
| Middle row | Sleeve/arm | Trousers | Boots | Rear head/hair |
| Bottom row | Plain skin | Wood | Steel | Apron inside |

The texture is packed into the Blender file and embedded in the GLB. The added texture increases the file size compared with v1's flat-color materials; the savings are in polygons, mesh objects and materials.

## Validation and scope

The GLB was loaded into a fresh Blender scene. It retained one mesh, one material, one embedded texture, the 29-bone rig and all three clips. The exported mesh has 1,450 triangles, valid UV coordinates, normalized weights, no unweighted vertices and at most three bone influences per vertex. Twenty-one sampled animation poses produced finite geometry within the expected bounds. The Blender file was also reopened to confirm that all three actions and its packed atlas persist.

This is a low-poly body rig with demo animations. It has no facial animation rig, individual fingers, IK foot locking, cloth simulation or automatic collision avoidance. Large poses may need manual apron adjustment. The single character object contains separate connected components; it is not a watertight printing mesh. No specific game-engine retargeting has been performed.
