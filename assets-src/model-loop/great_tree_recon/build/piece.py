"""Slice driver (scene-recon): one Trellis piece from scene.json -> cleaned, retextured, QA'd, rendered.

    BPY_PY=<python with bpy> skills/scene-recon/scripts/run_bpy.sh assets-src/model-loop/great_tree_recon/build/piece.py -- <id> <tag>

Reads the piece from ../scene.json (mesh, dims_m, fit, tris, ref_view) and the knobs in KNOBS below.
Steps: recon_import.run -> shading + per-facet value attribute -> materials (loop_mat box projection; moss paint and the
rune glow on top) -> qa_check -> loop_render (4 turntable views + the ref view) -> save <asset>_recon.blend and a
rounds/ copy. Prints one @@RESULT@@ JSON line. A rework round changes KNOBS only (note the judge's fix next to it).

Reused by path, read-only: skills/model-loop/scripts (loop_mat, loop_render), skills/scene-recon/scripts
(recon_import, headless), temple_ruin/build/tcommon.py (STONE knobs, _spec) and great_tree/build/tree_common.py
(BARK knobs, paint_moss, GLOW): the look the user accepted on the hand-modelled runs.
Env: RECON_OUT=<dir> writes the .blend and renders there instead of the run folder (pipeline dry runs).
"""
import json
import os
import random
import sys

import bpy

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LOOPS = os.path.dirname(R)  # assets-src/model-loop
OUT = os.environ.get("RECON_OUT", R)

import headless  # noqa: E402  (scene-recon/scripts is on PYTHONPATH through run_bpy.sh)

loop_render = headless.setup()
for _p in (os.path.join(LOOPS, "temple_ruin", "build"), os.path.join(LOOPS, "great_tree", "build")):
    sys.path.insert(0, _p)
import loop_mat  # noqa: E402
import recon_import  # noqa: E402
import tcommon  # noqa: E402  temple_ruin's toolkit (its D:/ sys.path entries do nothing here)
import tree_common as TC  # noqa: E402  great_tree's bark / moss / glow

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check  # noqa: E402

# ---------------------------------------------------------------------------------------------------- knobs
# One dict per piece. Rework rounds edit these (free); a new Trellis run needs the user's OK (credits).
KNOBS = {
    "runestone": dict(
        shade="flat",            # "flat" | "smooth" (smooth = by angle, sharp above 40 deg)
        planar_deg=0.0,          # > 0: merge near-coplanar triangles into facets first (limited dissolve)
        # pre-judge colour pass (colmeasure, lit tops): reference #949289, render #6c6d6e with the temple's tint (0.99, 0.99, 1.0) gain 0.46
        # (tuned for EEVEE; Cycles renders it darker) -> warmer and lighter
        stone=dict(tile_m=0.9, mask="curv", ridge=0.12, crease=0.35, ridge_col=(0.86, 0.85, 0.82, 1), top_light=0.35, ao=0.3,
                   tex_contrast=0.45, tex_sat=0.2, tint=(1.0, 0.95, 0.83), gain=0.85, face_var=0.10),
        moss=None,               # the reference stone is clean granite: no moss (threshold, lower = more; None = off)
        # rune glow: the GPT mask front-projected onto the panel that build/orient.py found on the mesh (scene.json panel_box);
        # grow = the mask's drawing (it includes the panel's border line) relative to the baked cyan area
        # pre-judge fix: stretching the mask to the panel's width made the knot 1.7x too fat; keep its aspect, fit the height
        rune=dict(strength=3.0, grow=1.08),
        loose=dict(),
    ),
    "trunk_roots": dict(
        shade="flat",
        planar_deg=0.0,
        # pre-judge colour pass (colmeasure, bark without moss): tops matched (#7e735b vs #7f725f) but sides #29200d against #303025 and
        # top/side contrast 3.9 against 2.5 -> less yellow, softer creases and AO
        bark=dict(tile_m=1.1, mask="curv", ridge=0.08, crease=0.2, top_light=0.22, ao=0.15, tex_contrast=0.08, tex_sat=0.75,
                  tint=(0.87, 0.95, 1.0), gain=1.14, face_var=0.16),
        # olive moss paint on the bark (tree_common.MOSS_BARK). pre-judge fix: on a 10 m piece the limb recipe (scale 4,
        # thresh 0.62) read as camouflage speckle; fewer, larger patches
        moss=dict(thresh=0.70, scale=1.3, stretch=(1.0, 1.0, 1.0)),
        # Trellis broke some thin roots off: detached islands float (qa_check errors). Drop islands under 3 % of the triangles
        # unless they span a quarter of the piece
        loose=dict(min_face_frac=0.03, min_diag_frac=0.25),
    ),
}


def rel(path):
    return bpy.path.relpath(os.path.join(R, path))


def facets(ob, shade, planar_deg, seed=1):
    """Shading and the 'fvar' face attribute (0..1 per facet) that loop_mat's face_var reads."""
    import math

    import bmesh

    me = ob.data
    if planar_deg > 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(planar_deg), verts=bm.verts, edges=bm.edges)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(me)
        bm.free()
    for p in me.polygons:
        p.use_smooth = shade != "flat"
    if shade != "flat":
        me.set_sharp_from_angle(angle=math.radians(40))
    rnd = random.Random(seed)
    at = me.attributes.get("fvar") or me.attributes.new("fvar", "FLOAT", "FACE")
    at.data.foreach_set("value", [rnd.random() for _ in me.polygons])
    me.update()
    return len(me.polygons)


def rune_glow(mat, ob, w, h, cx, cz, strength, mask_png):
    """Front-project the white-on-black rune mask onto the -Y side as emission. w, h, cx, cz: the panel in metres (object space)."""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    img = bpy.data.images.load(mask_png, check_existing=True)
    img.colorspace_settings.name = "Non-Color"
    iw, ih = img.size
    # the mask's drawing does not fill its image: find the drawing's box so w x h is the panel itself
    import numpy as np

    px = np.empty(iw * ih * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    lum = px.reshape(ih, iw, 4)[:, :, 0] > 0.5
    ys, xs = np.nonzero(lum)
    u0, u1, v0, v1 = xs.min() / iw, (xs.max() + 1) / iw, ys.min() / ih, (ys.max() + 1) / ih  # v is up (Blender rows start at the bottom)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def remap(src, a, b, c, d):
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.clamp = False
        for k, v in (("From Min", a), ("From Max", b), ("To Min", c), ("To Max", d)):
            mr.inputs[k].default_value = v
        nt.links.new(src, mr.inputs["Value"])
        return mr.outputs["Result"]

    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    if w is None:  # keep the drawing's aspect: its width follows from the panel's height
        w = h * ((u1 - u0) * iw) / ((v1 - v0) * ih)
    nt.links.new(remap(sep.outputs["X"], cx - w / 2, cx + w / 2, u0, u1), comb.inputs["X"])
    nt.links.new(remap(sep.outputs["Z"], cz - h / 2, cz + h / 2, v0, v1), comb.inputs["Y"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image, tex.extension, tex.interpolation = img, "CLIP", "Linear"
    nt.links.new(comb.outputs[0], tex.inputs["Vector"])
    # only on faces that look to the front (-Y in object space)
    nsep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Normal"], nsep.inputs[0])
    front = remap(nsep.outputs["Y"], -0.35, -0.6, 0.0, 1.0)
    fr = nt.nodes.new("ShaderNodeClamp")
    nt.links.new(front, fr.inputs["Value"])
    line = nt.nodes.new("ShaderNodeMath")
    line.operation = "MULTIPLY"
    nt.links.new(tex.outputs["Color"], line.inputs[0])
    nt.links.new(fr.outputs[0], line.inputs[1])
    glow = (*TC.GLOW, 1)
    base = bsdf.inputs["Base Color"].links[0].from_socket
    nt.links.new(loop_mat._mix(nt, "MIX", line.outputs[0], base, (0.55, 0.85, 0.9, 1)), bsdf.inputs["Base Color"])
    bsdf.inputs["Emission Color"].default_value = glow
    st = nt.nodes.new("ShaderNodeMath")
    st.operation = "MULTIPLY"
    nt.links.new(line.outputs[0], st.inputs[0])
    st.inputs[1].default_value = strength
    nt.links.new(st.outputs[0], bsdf.inputs["Emission Strength"])
    return {"mask_box_uv": [round(float(v), 3) for v in (u0, u1, v0, v1)], "w_m": round(float(w), 3)}


def mask_pass(pid, path, res=(1024, 1024)):
    """Object-only alpha render from REF_CAM (everything else hidden, transparent film): the mask colmeasure.py uses."""
    sc = bpy.context.scene
    keep = {o.name for o in bpy.data.collections["P_" + pid].all_objects}
    saved = {o: o.hide_render for o in bpy.data.objects}
    state = (sc.camera, sc.render.film_transparent, sc.render.filepath, sc.render.resolution_x, sc.render.resolution_y,
             sc.render.image_settings.color_mode, sc.cycles.samples)
    try:
        for o in bpy.data.objects:
            o.hide_render = o.name not in keep
        sc.camera = bpy.data.objects["REF_CAM"]
        sc.render.engine, sc.cycles.samples, sc.render.film_transparent = "CYCLES", 1, True
        sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.image_settings.file_format, sc.render.image_settings.color_mode = "PNG", "RGBA"
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
    finally:
        for o, h in saved.items():
            o.hide_render = h
        (sc.camera, sc.render.film_transparent, sc.render.filepath, sc.render.resolution_x, sc.render.resolution_y,
         sc.render.image_settings.color_mode, sc.cycles.samples) = state
    return path


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    pid, tag = args[0], args[1]
    scene = json.load(open(os.path.join(R, "scene.json")))
    piece = next(p for p in scene["pieces"] if p["id"] == pid)
    K = KNOBS[pid]
    blend = os.path.join(OUT, "great_tree_recon.blend")
    os.makedirs(OUT, exist_ok=True)
    if os.path.isfile(blend):
        bpy.ops.wm.open_mainfile(filepath=blend)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.wm.save_as_mainfile(filepath=blend)
    old = bpy.data.collections.get("P_" + pid)
    if old:  # rebuild this piece only
        for o in list(old.objects):
            bpy.data.objects.remove(o)
    glb = os.environ.get("RECON_GLB") or os.path.join(R, piece["mesh"])
    out = {"piece": pid, "tag": tag, "import": recon_import.run(glb, pid, piece["dims_m"], piece["tris"], fit=piece.get("fit", "fit"),
                                                                yaw_deg=piece.get("mesh_yaw", 0.0), **K.get("loose", {}))}
    ob = bpy.data.objects[pid]
    out["facets"] = facets(ob, K["shade"], K["planar_deg"])
    out["curv"] = loop_mat.edge_mask(ob)
    if pid == "runestone":
        m = tcommon._spec(loop_mat.material("M_recon_stone", rel("textures/stone_cut.png"), rough=1.0, **K["stone"]))
        if K["moss"] is not None:
            TC.paint_moss(m, thresh=K["moss"], col=TC.MOSS_COL)
        W, _, H = out["import"]["size_m"]
        box = piece.get("panel_box") or dict(cx=0.0, cz=0.45, w=0.5, h=0.7)  # fallback: a guess from the reference
        g = K["rune"]["grow"]
        panel = dict(w=None, h=box["h"] * H * g, cx=box["cx"] * W, cz=box["cz"] * H)
        out["rune"] = dict(rune_glow(m, ob, mask_png=os.path.join(R, "style", "rune_mask.png"), strength=K["rune"]["strength"], **panel),
                           panel_m={k: round(v, 3) for k, v in panel.items() if v is not None})
    else:
        m = tcommon._spec(loop_mat.material("M_recon_bark", rel("textures/bark.png"), rough=1.0, **K["bark"]))
        if K["moss"] is not None:
            TC.paint_moss(m, col=TC.MOSS_BARK, **K["moss"])
    ob.data.materials.clear()
    ob.data.materials.append(m)
    out["qa_errors"] = qa_check.run(objects=[pid], profile="render").get("errors", [])
    rdir = os.path.join(OUT, "renders", pid)
    rv = tuple(piece["ref_view"])
    for _ in range(4):  # loop_render.run sometimes throws on a repeated call; the retry passes (great_tree/build/drive.py)
        try:
            out["render"] = loop_render.run("P_" + pid, rdir, tag, res=512, ref_view=rv, ref_res=(1024, 1024))
            break
        except AttributeError:
            continue
    else:
        raise RuntimeError("loop_render.run kept failing")
    out["mask"] = mask_pass(pid, os.path.join(rdir, f"{tag}_mask.png"))
    bpy.ops.wm.save_mainfile()
    os.makedirs(os.path.join(OUT, "rounds"), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "rounds", f"{pid}_{tag}.blend"), copy=True)
    print("@@RESULT@@" + json.dumps(out, default=str))


main()
