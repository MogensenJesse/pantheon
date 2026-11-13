"""One-off per Trellis mesh: fit its yaw to the reference and, for the runestone, find the rune panel on its front.
Writes mesh_yaw / mesh_yaw_fit / panel_box into scene.json (the mesh does not change between rounds, so piece.py reads them).

    BPY_PY=<python with bpy> skills/scene-recon/scripts/run_bpy.sh assets-src/model-loop/great_tree_recon/build/orient.py -- runestone trunk_roots
"""
import json
import os
import sys

import orient_fit

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
path = os.path.join(R, "scene.json")
scene = json.load(open(path))
for pid in sys.argv[sys.argv.index("--") + 1:]:
    piece = next(p for p in scene["pieces"] if p["id"] == pid)
    glb = os.path.join(R, piece["mesh"])
    fit = orient_fit.run(glb, os.path.join(R, piece["ref"]), ref_view=tuple(piece["ref_view"]), res=320)
    piece["mesh_yaw"] = fit["yaw"]
    piece["mesh_yaw_fit"] = {"best_first": fit["scores"], "columns": ["yaw", "score", "silhouette_iou", "colour"]}
    if "rune_glow" in piece.get("materials", []):
        # the baked rune is pale cyan: bluer and greener than red
        box = orient_fit.colour_box(glb, fit["yaw"], lambda c: (c[:, 2] > c[:, 0] + 0.06) & (c[:, 1] > c[:, 0] + 0.03))
        piece["panel_box"] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in box.items()} if box else None
    print("@@RESULT@@", pid, json.dumps({"yaw": fit["yaw"], "top": fit["scores"][:3], "panel_box": piece.get("panel_box")}))
json.dump(scene, open(path, "w"), indent=1)
