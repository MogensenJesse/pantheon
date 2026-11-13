"""Write the well's building blocks as standalone files: one .blend per part collection (P_*) and per group (G_*), each holding only that
collection and what it depends on (meshes, materials, images), plus kit/manifest.json. The collections are marked as assets, so
kit/ can be added as an Asset Browser library, or appended/linked from any other file.
blender -b root_work.blend --factory-startup --python kit_export.py   (works on the loaded copy only, root_work.blend is not saved)
"""
import json
import os
import shutil

import bpy

R = r"D:/pantheon/assets-src/model-loop/well_test"
KIT = R + "/kit"
PARTS = ["stone", "plank", "timber", "windlass", "crank", "bucket", "shingle"]
GROUPS = ["shaft", "deck", "frame", "roof"]  # G_<id>: built from the parts above (linked meshes), so each file stands alone
NOTE = {
    "stone": "chunky chiselled slate block: a/b/c the original squarer r05 stones, d-i six irregular loaves (VARIANTS in stone.py: own outline, end wedge/lean, pillowy cast), material v2: slate",
    "plank": "wood plank with chiselled rim and groove, 3 variants (material v2: duller ochre)",
    "timber": "squared beam, chamfers and chisel scoops; a/b straight, c-f each with its own bow, S-curve, twist and taper (VARIANTS in timber.py), redder v2 material",
    "windlass": "log with a 7-turn rope coil and a hanging strand; knob P['hang'] sets the strand length (0.24 m here)",
    "crank": "plate, peg and bolt cap (plate material v2: darker brown)",
    "bucket": "staved wooden bucket with an iron band, bail and grip",
    "shingle": "thin flat roof board, 3 variants a/b/c (v2: flat eave, redder)",
    "shaft": "dry-stone ring, 3 courses of 11 linked copies of stone d-i picked by width, equal depth, fat top-course coping (shaft.py)",
    "deck": "packed plank deck, thin slabs (deck.py, t_scale knob)",
    "frame": "timber frame: posts, tie beam, braces, windlass, crank, bucket (frame.py)",
    "roof": "gable roof from linked shingles and slim plank finials (roof.py)",
}

os.makedirs(KIT + "/textures", exist_ok=True)
for img in bpy.data.images:
    src = bpy.path.abspath(img.filepath) if img.filepath else ""
    if src and os.path.isfile(src) and not src.startswith(KIT):
        shutil.copy2(src, KIT + "/textures/" + os.path.basename(src))
        img.filepath = "//textures/" + os.path.basename(src)  # relative to the kit file, whatever machine it lands on

dg = bpy.context.evaluated_depsgraph_get()
manifest = {}
for kind, ids in (("part", PARTS), ("group", GROUPS)):
    for i in ids:
        col = bpy.data.collections[("P_" if kind == "part" else "G_") + i]
        objs, mats, tris = [], set(), 0
        for o in col.all_objects:
            if o.type != "MESH":
                continue
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            tris += sum(len(p.vertices) - 2 for p in me.polygons)
            ev.to_mesh_clear()
            mats.update(m.name for m in o.data.materials if m)
            if kind == "part":
                objs.append({"name": o.name, "dims_m": [round(v, 3) for v in o.dimensions]})
        col.asset_mark()
        col.asset_data.description = NOTE[i]
        col.asset_data.tags.new("well", skip_if_exists=True)
        col.asset_data.tags.new(kind, skip_if_exists=True)
        path = f"{KIT}/{kind}_{i}.blend"
        bpy.data.libraries.write(path, {col}, path_remap="NONE", fake_user=True, compress=True)
        manifest[f"{kind}_{i}"] = {"collection": col.name, "file": os.path.basename(path), "note": NOTE[i], "builder": f"build/{i}.py",
                                   "objects": objs if kind == "part" else len(list(col.all_objects)), "tris": tris, "materials": sorted(mats),
                                   "size_kb": round(os.path.getsize(path) / 1024)}
json.dump(manifest, open(KIT + "/manifest.json", "w"), indent=1)
print("@@RESULT@@" + json.dumps({k: (v["tris"], v["size_kb"]) for k, v in manifest.items()}))
