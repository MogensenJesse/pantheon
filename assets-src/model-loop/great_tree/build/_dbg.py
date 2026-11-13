import bpy, json
out = {}
for n in ("runestone_a",):
    ob = bpy.data.objects[n]
    me = ob.data
    out["slots"] = [m.name if m else None for m in me.materials]
    area = {}
    for f in me.polygons:
        area[f.material_index] = round(area.get(f.material_index, 0) + f.area, 3)
    out["area"] = area
    zs = [v.co.z for v in me.vertices]
    out["z"] = [round(min(zs), 3), round(max(zs), 3)]
    for m in [x for x in me.materials if x and x.name.startswith("M_rune_")]:
        b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
        out[m.name] = [round(b.inputs["Emission Strength"].default_value, 2), [round(c, 2) for c in b.inputs["Base Color"].default_value]]
print("@@D@@" + json.dumps(out))
