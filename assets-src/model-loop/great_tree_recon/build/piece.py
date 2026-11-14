"""Piece driver (scene-recon): one Trellis piece from scene.json -> cleaned, retextured, QA'd, rendered.

    BPY_PY=<python with bpy> skills/scene-recon/scripts/run_bpy.sh assets-src/model-loop/great_tree_recon/build/piece.py -- <id> <tag>

Reads the piece from ../scene.json (mesh, dims_m, fit, tris, ref_view, mesh_yaw, panel_box) and its knobs in KNOBS below.
Steps: recon_import.run -> facets (shading + per-facet value) -> material (loop_mat box projection, then bump, moss paint and
the rune glow on top) -> qa_check -> loop_render (4 turntable views + the ref view) -> object mask pass -> save
great_tree_recon.blend and a rounds/ copy. Prints one @@RESULT@@ JSON line. A rework round changes KNOBS only: note the
judge's fix next to the knob.

Reused by path, read-only: skills/model-loop/scripts (loop_mat, loop_render), skills/scene-recon/scripts (recon_import,
headless), temple_ruin/build/tcommon.py (_spec) and great_tree/build/tree_common.py (GLOW): the user-accepted runs.
Env: RECON_OUT=<dir> writes the .blend and renders there instead of the run folder (pipeline dry runs).
"""
import json
import math
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
import tree_common as TC  # noqa: E402  great_tree's glow colour

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check  # noqa: E402


def srgb(r, g, b):
    """sRGB 0-255 -> linear, for colours quoted from a reference or a judge."""
    return tuple(((c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4) for c in (r, g, b))


# ---------------------------------------------------------------------------------------------------- knobs
# One dict per piece. Rework rounds edit these (free); a new Trellis run needs the user's OK (credits).
#   tris        overrides scene.json's triangle target
#   planar_deg  > 0: merge near-coplanar triangles into facets (limited dissolve); each facet gets one 'fvar' value
#   shade       "flat" | "smooth" (by angle, sharp above smooth_deg)
#   imp         extra recon_import.run arguments (loose-part thresholds, inflate_m, voxel_m)
#   texture/mat loop_mat.material's image and arguments
KNOBS = {
    "runestone": dict(
        # r02 (judge r01 4.8): crumpled-paper triangles -> fewer, larger planar facets; the lower count also flattens Trellis's
        # own knot relief, which the projected rune fought with ("keep one knot only")
        tris=1800, planar_deg=12.0, shade="flat",
        # r02: thin fin and open slits where the frame slab did not meet the body -> one closed skin (1.2 cm voxels)
        imp=dict(voxel_m=0.012),
        texture="textures/stone_cut.png",
        # r01 pre-judge: tint (1, 0.95, 0.83) gain 0.85 matched the lit tops by measurement (#98958d vs #949289) but was judged "pale warm
        # off-white" -> r02: mid-grey (ref near sRGB 135,135,128), less warm, visible mottle, darker crevices, lighter ridges, darker foot
        mat=dict(tile_m=0.9, mask="curv", ridge=0.15, crease=0.5, ridge_col=(0.86, 0.85, 0.82, 1), top_light=0.3, ao=0.35,
                 tex_contrast=0.85, tex_sat=0.25, tint=(1.0, 0.98, 0.93), gain=0.6, face_var=0.12, bottom_dark=0.12),
        moss=None,   # the reference stone is clean granite
        bump=None,
        # rune glow: a GPT mask front-projected onto the panel build/orient.py found on the mesh (scene.json panel_box).
        # r02 (judge: knot 15-20 cm off the recess, strokes 3 cm against 6-7, saturated cyan, floor same grey as the body):
        #   panel_box now from the median / interquartile range (the 3-97 % span was pulled sideways by colour on a frame leg);
        #   mask v2 = one thick band, two lozenges, no border; it fills the panel (fill) instead of keeping its own aspect;
        #   paler emission; a blue-grey floor behind it.
        rune=dict(mask="style/rune_mask_v2.png", fill=0.94, strength=1.5, glow=srgb(190, 235, 240), line=srgb(205, 238, 242),
                  floor=dict(col=srgb(95, 115, 125), mix=0.85, pad=1.16, edge_m=0.04)),
    ),
    "trunk_roots": dict(
        planar_deg=0.0,
        # r02 (judge r01 4.3: "large smooth triangles", flat-shaded noise on thin roots) -> smooth by angle
        shade="smooth", smooth_deg=35.0,
        # Trellis broke some thin roots off (qa_check: floating): drop islands under 3 % of the triangles unless they span a quarter
        # of the piece. r02 (judge: roots 0.3-0.45 m thick against 0.8-1.0, airy cage): fatten every strand by 10 cm a side, then
        # one closed skin so what now overlaps merges
        imp=dict(min_face_frac=0.03, min_diag_frac=0.25, inflate_m=0.10, voxel_m=0.045),
        texture="textures/bark.png",
        # r01 pre-judge: tint (0.87, 0.95, 1.0) gain 1.14 measured right on the tops but was judged "pale bone-beige" -> r02: warm
        # olive-taupe (judge: about #7A6F58, crevices #4A4435), the bark texture's streaks visible, softer creases (top/side contrast
        # was 4.1 against 2.5)
        # (pre-judge measure of r02 with tint (0.97, 0.93, 0.82) gain 0.78: tops #665a3d against #7e735b, too yellow and a little dark
        # -> half-way back, less saturated)
        mat=dict(tile_m=1.1, mask="curv", ridge=0.10, crease=0.3, top_light=0.15, ao=0.12, tex_contrast=0.5, tex_sat=0.7,
                 tint=(0.95, 0.94, 0.90), gain=0.86, face_var=0.05),
        # r02 (judge: no bark relief): the bark texture's value as a bump (shading only; the outline does not change)
        bump=dict(strength=0.6, distance=0.05),
        # r02 (judge: hard-edged saturated camouflage blotches, also on vertical faces): soft-edged desaturated olive (#6B7038),
        # up-facing surfaces only, about 15 % cover
        # (pre-judge look at r02: at strength 0.7 / thresh 0.60 it lit up yellow-green under the studio key and covered about a quarter)
        moss=dict(col=srgb(92, 98, 50), thresh=0.64, soft=0.14, scale=0.9, w_up=0.25, up_min=0.2, up_soft=0.5, strength=0.55),
        rune=None,
    ),
}


def rel(path):
    return bpy.path.relpath(os.path.join(R, path))


def facets(ob, shade, planar_deg=0.0, smooth_deg=40.0, seed=1):
    """Shading and the 'fvar' face attribute (0..1 per facet) that loop_mat's face_var reads. With planar_deg the
    near-coplanar triangles are merged first, so one facet = one value (its triangles inherit it)."""
    import bmesh

    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    if planar_deg > 0:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(planar_deg), verts=bm.verts, edges=bm.edges)
    lay = bm.faces.layers.float.get("fvar") or bm.faces.layers.float.new("fvar")
    rnd = random.Random(seed)
    for f in bm.faces:
        f[lay] = rnd.random()
    n = len(bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = shade != "flat"
    if shade != "flat":
        me.set_sharp_from_angle(angle=math.radians(smooth_deg))
    me.update()
    return n


def _nodes(mat):
    nt = mat.node_tree
    return nt, next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")


def _remap(nt, src, a, b, c=0.0, d=1.0, clamp=True, smooth=False):
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = clamp
    if smooth:
        mr.interpolation_type = "SMOOTHSTEP"
    for k, v in (("From Min", a), ("From Max", b), ("To Min", c), ("To Max", d)):
        mr.inputs[k].default_value = v
    nt.links.new(src, mr.inputs["Value"])
    return mr.outputs["Result"]


def _math(nt, op, a, b=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def bump(mat, strength=0.5, distance=0.04):
    """The box-projected texture's value as a bump: painted streaks read as shallow relief."""
    nt, bsdf = _nodes(mat)
    col = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.projection == "BOX")
    # a height map must be Non-Color (qa_check: "feeds ['bump'] but is sRGB"): the same file as a second, data image
    data = bpy.data.images.load(bpy.path.abspath(col.image.filepath), check_existing=False)
    data.name, data.colorspace_settings.name = col.image.name + "_height", "Non-Color"
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image, tex.projection, tex.projection_blend = data, "BOX", col.projection_blend
    nt.links.new(col.inputs["Vector"].links[0].from_socket, tex.inputs["Vector"])
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(tex.outputs["Color"], bw.inputs[0])
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value, b.inputs["Distance"].default_value = strength, distance
    nt.links.new(bw.outputs[0], b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])


def soft_moss(mat, col, thresh=0.6, soft=0.14, scale=0.9, w_up=0.25, up_min=0.2, up_soft=0.5, strength=0.7):
    """Moss as a soft-edged tint: object-space noise patches, pushed toward up-facing faces and absent below up_min
    (normal z). great_tree's paint_moss cuts crisp-edged dabs for a limb; on a 10 m piece those read as camouflage."""
    nt, bsdf = _nodes(mat)
    src = bsdf.inputs["Base Color"].links[0].from_socket
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value, nz.inputs["Detail"].default_value, nz.inputs["Roughness"].default_value = scale, 3.0, 0.6
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value, fine.inputs["Detail"].default_value = scale * 4, 2.0
    nt.links.new(tc.outputs["Object"], fine.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(nt.nodes.new("ShaderNodeNewGeometry").outputs["Normal"], sep.inputs[0])
    up = sep.outputs["Z"]
    val = _math(nt, "ADD", nz.outputs["Fac"], _math(nt, "MULTIPLY", up, w_up))
    val = _math(nt, "ADD", val, _math(nt, "MULTIPLY", _math(nt, "SUBTRACT", fine.outputs["Fac"], 0.5), 0.08))
    fac = _math(nt, "MULTIPLY", _remap(nt, val, thresh, thresh + soft, smooth=True), _remap(nt, up, up_min, up_min + up_soft, smooth=True))
    fac = _math(nt, "MULTIPLY", fac, strength)
    tone = nt.nodes.new("ShaderNodeVectorMath")
    tone.operation = "SCALE"
    tone.inputs[0].default_value = col
    nt.links.new(_math(nt, "ADD", _math(nt, "MULTIPLY", fine.outputs["Fac"], 0.5), 0.75), tone.inputs["Scale"])
    nt.links.new(loop_mat._mix(nt, "MIX", fac, src, tone.outputs["Vector"]), bsdf.inputs["Base Color"])


def rune_glow(mat, w, h, cx, cz, mask_png, strength, glow, line, floor=None):
    """Front-project the white-on-black rune mask onto the -Y side as emission; the drawing fills w x h metres at (cx, cz)
    in object space. floor: a tinted rectangle behind it (col, mix, pad = size relative to the drawing, edge_m = soft edge)."""
    import numpy as np

    nt, bsdf = _nodes(mat)
    img = bpy.data.images.load(mask_png, check_existing=True)
    img.colorspace_settings.name = "Non-Color"
    iw, ih = img.size
    px = np.empty(iw * ih * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    ys, xs = np.nonzero(px.reshape(ih, iw, 4)[:, :, 0] > 0.5)  # the drawing does not fill its image: map its box, not the image
    u0, u1, v0, v1 = xs.min() / iw, (xs.max() + 1) / iw, ys.min() / ih, (ys.max() + 1) / ih  # v is up (Blender rows start at the bottom)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(_remap(nt, sep.outputs["X"], cx - w / 2, cx + w / 2, u0, u1, clamp=False), comb.inputs["X"])
    nt.links.new(_remap(nt, sep.outputs["Z"], cz - h / 2, cz + h / 2, v0, v1, clamp=False), comb.inputs["Y"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image, tex.extension, tex.interpolation = img, "CLIP", "Linear"
    nt.links.new(comb.outputs[0], tex.inputs["Vector"])
    nsep = nt.nodes.new("ShaderNodeSeparateXYZ")  # only on faces that look to the front (-Y in object space)
    nt.links.new(tc.outputs["Normal"], nsep.inputs[0])
    front = _remap(nt, nsep.outputs["Y"], -0.35, -0.6)
    base = bsdf.inputs["Base Color"].links[0].from_socket
    if floor:
        fx = _remap(nt, _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", sep.outputs["X"], cx)), w / 2 * floor["pad"], w / 2 * floor["pad"] - floor["edge_m"], smooth=True)
        fz = _remap(nt, _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", sep.outputs["Z"], cz)), h / 2 * floor["pad"], h / 2 * floor["pad"] - floor["edge_m"], smooth=True)
        ff = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", fx, fz), front), floor["mix"])
        base = loop_mat._mix(nt, "MIX", ff, base, (*floor["col"], 1))
    ln = _math(nt, "MULTIPLY", tex.outputs["Color"], front)
    nt.links.new(loop_mat._mix(nt, "MIX", ln, base, (*line, 1)), bsdf.inputs["Base Color"])
    bsdf.inputs["Emission Color"].default_value = (*glow, 1)
    nt.links.new(_math(nt, "MULTIPLY", ln, strength), bsdf.inputs["Emission Strength"])
    return {"mask_box_uv": [round(float(v), 3) for v in (u0, u1, v0, v1)], "panel_m": {"w": round(w, 3), "h": round(h, 3), "cx": round(cx, 3), "cz": round(cz, 3)}}


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
    out = {"piece": pid, "tag": tag,
           "import": recon_import.run(glb, pid, piece["dims_m"], K.get("tris", piece["tris"]), fit=piece.get("fit", "fit"),
                                      yaw_deg=piece.get("mesh_yaw", 0.0), **K.get("imp", {}))}
    ob = bpy.data.objects[pid]
    out["facets"] = facets(ob, K["shade"], K.get("planar_deg", 0.0), K.get("smooth_deg", 40.0))
    out["curv"] = loop_mat.edge_mask(ob)
    old_mat = bpy.data.materials.get("M_recon_" + pid)
    if old_mat:  # loop_mat reuses a material by name but only resets its own nodes: start clean so bump / moss / rune do not pile up
        bpy.data.materials.remove(old_mat)
    m = tcommon._spec(loop_mat.material("M_recon_" + pid, rel(K["texture"]), rough=1.0, **K["mat"]))
    if K.get("bump"):
        bump(m, **K["bump"])
    if K.get("moss"):
        soft_moss(m, **K["moss"])
    if K.get("rune"):
        W, _, H = out["import"]["size_m"]
        box = piece.get("panel_box") or dict(cx=0.0, cz=0.45, w=0.5, h=0.7)  # fallback: a guess from the reference
        rk = K["rune"]
        out["rune"] = rune_glow(m, w=box["w"] * W * rk["fill"], h=box["h"] * H * rk["fill"], cx=box["cx"] * W, cz=box["cz"] * H,
                                mask_png=os.path.join(R, rk["mask"]), strength=rk["strength"], glow=rk["glow"], line=rk["line"], floor=rk.get("floor"))
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
    json.dump(out, open(os.path.join(rdir, f"{tag}_result.json"), "w"), indent=1, default=str)
    print("@@RESULT@@" + json.dumps(out, default=str))


main()
