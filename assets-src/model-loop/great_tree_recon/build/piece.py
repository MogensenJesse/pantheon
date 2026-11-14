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
        # r03 = NEW MESH (Trellis run on refs/trunk_roots_v2.png: braided strands, flat top, knot band, about twelve thick roots with
        # claws, a front opening). The r01/r02 knobs belonged to the first mesh (meshes/trunk_roots.glb, best r02 4.8) and are in git.
        # Shading: the r02 judge called smooth shading "a clay sculpt" and asked for flat chiselled planes 0.2-0.5 m across -> planar facets, flat
        planar_deg=7.0, shade="flat",
        # roots are thick in this mesh: no inflate. Islands under 2 % of the triangles go unless they span a quarter of the piece
        imp=dict(min_face_frac=0.02, min_diag_frac=0.25),
        settle=dict(drop_below=0.002, overlap_m=0.03), drop_overlaps=True,
        texture="textures/bark.png",
        # r02 judge: bark close but slightly light, yellow and uniform -> about #7A6F58 with a cooler grey-olive cast, 10-15 % value change from
        # plate to plate (face_var on the planar facets)
        mat=dict(tile_m=1.1, mask="curv", ridge=0.10, crease=0.35, top_light=0.15, ao=0.15, tex_contrast=0.35, tex_sat=0.65,
                 tint=(0.93, 0.94, 0.92), gain=0.80, face_var=0.13),
        # r02 judge: the bump read as "a fine pinstripe wrapping round the limbs like lathe marks" -> off; the facets carry the relief
        bump=None,
        # r02 judge: moss soft-edged now but saturated yellow-green in large patches -> desaturated olive (#6B6F45), 10-15 % cover, 30-50 % blend
        moss=dict(col=srgb(80, 84, 52), thresh=0.70, soft=0.14, scale=0.9, w_up=0.25, up_min=0.25, up_soft=0.5, strength=0.45),
        rune=None,
    ),
    "crown": dict(
        # limbs and leaf pads in one Trellis mesh. No voxel skin (leaves are thinner than a useful voxel); flat facets, the look the
        # trunk judge asked for in r02
        planar_deg=6.0, shade="flat",
        imp=dict(min_face_frac=0.004, min_diag_frac=0.06),
        texture="textures/bark.png",
        mat=dict(tile_m=1.1, mask="curv", ridge=0.10, crease=0.3, top_light=0.15, ao=0.12, tex_contrast=0.5, tex_sat=0.7,
                 tint=(0.92, 0.94, 0.96), gain=1.3, face_var=0.10),   # the trunk's r02 bark, lifted and greyer: under the canopy it measured
        # #3d3521 on the lit tops against the reference's #645f51
        bump=None,
        moss=dict(col=srgb(92, 98, 50), thresh=0.66, soft=0.14, scale=0.9, w_up=0.25, up_min=0.2, up_soft=0.5, strength=0.5),
        rune=None,
        # Trellis left 28 clumps hanging free (one a whole leaf pad): drop the crumbs, slide the rest into contact; 7 coplanar pairs overlapped
        settle=dict(drop_below=0.0015, overlap_m=0.03), drop_overlaps=True,
        # second material where the baked colour is leaf green (greener than red and blue). great_tree's LEAF knobs rendered lime in Cycles
        # (pre-judge look): darker, less top light
        split=dict(name="leaf", test="green", texture="textures/leaf.png",
                   # (measured: leaves #546b17 / #41530c against the reference's #606b33 / #36432a: too saturated, a little bright)
                   mat=dict(tile_m=0.9, mask="curv", ridge=0.0, crease=0.3, top_light=0.3, ao=0.3, tex_contrast=0.7, tex_sat=0.62,
                            tint=(0.95, 0.97, 1.0), gain=0.46, face_var=0.3)),
    ),
    "rockery": dict(
        tris=30000, planar_deg=10.0, shade="flat",
        # (first try with voxel_m=0.03 shredded it into thin fences and 1253 loose triangles: this mesh is not a closed volume,
        # and a voxel skin of an open shell is junk) -> no voxel pass
        imp=dict(min_face_frac=0.01, min_diag_frac=0.08),
        texture="textures/stone_cut.png",
        mat=dict(tile_m=0.9, mask="curv", ridge=0.15, crease=0.5, ridge_col=(0.86, 0.85, 0.82, 1), top_light=0.3, ao=0.35,
                 tex_contrast=0.85, tex_sat=0.25, tint=(1.0, 0.98, 0.93), gain=0.52, face_var=0.12, bottom_dark=0.10),   # the runestone's r02 stone, 15 % darker (its judge)
        bump=None,
        # the reference's boulders wear a moss cap: olive green on every top, crisp-ish edge
        # (pre-judge look: srgb(112, 124, 52) lit up lime under the studio key -> darker olive)
        # (srgb(88, 100, 44) still read lime on the lit tops: darker again, and a little less of it)
        moss=dict(col=srgb(64, 74, 34), thresh=0.36, soft=0.12, scale=1.6, w_up=0.55, up_min=0.5, up_soft=0.3, strength=0.9),
        rune=None,
        drop_overlaps=True,   # 4 coplanar pairs lay on top of each other
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


def settle_islands(ob, drop_below=0.0015, overlap_m=0.02, tol=0.002):
    """Trellis leaves some clumps hanging in the air (qa_check: floating / detached). Islands under `drop_below` of the
    vertices are debris and go; a bigger one (a leaf pad) is slid along the shortest gap to the rest of the piece's
    SURFACE and `overlap_m` further, so its triangles really cross it (vertex-to-vertex moves let two leaf tips pass
    each other without touching)."""
    import bmesh
    from mathutils.bvhtree import BVHTree

    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen, islands = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, isl = [v], []
        seen.add(v.index)
        while stack:
            u = stack.pop()
            isl.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
        islands.append(isl)
    islands.sort(key=len, reverse=True)
    total = len(bm.verts)
    dropped = [isl for isl in islands[1:] if len(isl) < drop_below * total]
    for isl in dropped:
        bmesh.ops.delete(bm, geom=isl, context="VERTS")
    keep = [isl for isl in islands if isl[0].is_valid]
    bm.verts.index_update()
    bm.faces.ensure_lookup_table()
    moved = 0
    for isl in keep[1:]:
        mine = {v.index for v in isl}
        co = [v.co.copy() for v in bm.verts]
        rest = BVHTree.FromPolygons(co, [[v.index for v in f.verts] for f in bm.faces if f.verts[0].index not in mine], epsilon=0.0)
        own = [[v.index for v in f.verts] for f in bm.faces if f.verts[0].index in mine]
        for _ in range(6):
            if BVHTree.FromPolygons([v.co.copy() for v in bm.verts], own, epsilon=0.0).overlap(rest):
                break
            best = None
            for v in isl:
                loc, _, _, d = rest.find_nearest(v.co)
                if loc is not None and (best is None or d < best[0]):
                    best = (d, loc - v.co)
            if best is None:
                break
            step = best[1] + (best[1].normalized() if best[1].length > 1e-9 else best[1]) * overlap_m
            for v in isl:
                v.co += step
            moved += 1
    bm.to_mesh(me)
    bm.free()
    me.update()
    return {"islands": len(islands), "dropped": len(dropped), "moves": moved}


def drop_overlaps(ob, eps=0.001):
    """Delete one face of every pair of coplanar faces lying on top of each other (qa_check: z-fighting)."""
    import bmesh
    from mathutils.bvhtree import BVHTree

    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm, epsilon=0.0)
    kill = set()
    for f in bm.faces:
        if f.index in kill or f.normal.length < 0.5:
            continue
        cen = f.calc_center_median()
        mine = {v.index for v in f.verts}
        for p in [cen] + [cen.lerp(v.co, 0.6) for v in f.verts]:
            for _, n2, j, _ in bvh.find_nearest_range(p, eps):
                if j is None or j == f.index or j in kill:
                    continue
                g = bm.faces[j]
                if mine & {v.index for v in g.verts}:
                    continue
                if f.normal.dot(g.normal) > 0.98:
                    kill.add(max(f.index, j) if f.calc_area() >= g.calc_area() else f.index)
    if kill:
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in kill], context="FACES")
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(kill)


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


TESTS = {  # baked-colour tests for a second material (rgb as the image stores it, 0..1)
    "green": lambda c: (c[:, 1] > c[:, 0] * 1.06) & (c[:, 1] > c[:, 2] * 1.25),
}


def split_faces(ob, pts, rgb, test):
    """Which faces of the cleaned mesh sat where the raw mesh's baked colour passes `test`: nearest raw face centre in
    box-normalised coordinates (the cleaned mesh is the raw one scaled per axis, give or take its trimmed islands)."""
    import numpy as np
    from mathutils.kdtree import KDTree

    hit = TESTS[test](rgb)
    kd = KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert(p, i)
    kd.balance()
    me = ob.data
    n = len(me.polygons)
    cen = np.empty(n * 3, dtype=np.float32)
    me.polygons.foreach_get("center", cen)
    cen = cen.reshape(-1, 3)
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(0), co.max(0)
    q = (cen - lo) / np.maximum(hi - lo, 1e-9)
    idx = np.fromiter((kd.find(v)[1] for v in q), dtype=np.int64, count=n)
    return hit[idx]


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    pid, tag = args[0], args[1]
    scene = json.load(open(os.path.join(R, "scene.json")))
    piece = next(p for p in scene["pieces"] if p["id"] == pid)
    K = KNOBS[pid]
    glb = os.environ.get("RECON_GLB") or os.path.join(R, piece["mesh"])
    baked = None
    if K.get("split"):  # reads the raw mesh in an empty scene: before the run's .blend is opened
        import orient_fit

        baked = orient_fit.colour_points(glb, piece.get("mesh_yaw", 0.0))
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
    out = {"piece": pid, "tag": tag,
           "import": recon_import.run(glb, pid, piece["dims_m"], K.get("tris", piece["tris"]), fit=piece.get("fit", "fit"),
                                      yaw_deg=piece.get("mesh_yaw", 0.0), **K.get("imp", {}))}
    ob = bpy.data.objects[pid]
    if K.get("settle"):
        out["settle"] = settle_islands(ob, **K["settle"])
    out["facets"] = facets(ob, K["shade"], K.get("planar_deg", 0.0), K.get("smooth_deg", 40.0))
    if K.get("drop_overlaps"):
        out["overlaps_dropped"] = drop_overlaps(ob)
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
    if K.get("split"):
        sp = K["split"]
        old2 = bpy.data.materials.get(f"M_recon_{pid}_{sp['name']}")
        if old2:
            bpy.data.materials.remove(old2)
        m2 = tcommon._spec(loop_mat.material(f"M_recon_{pid}_{sp['name']}", rel(sp["texture"]), rough=1.0, **sp["mat"]))
        ob.data.materials.append(m2)
        sel = split_faces(ob, baked[0], baked[1], sp["test"])
        ob.data.polygons.foreach_set("material_index", sel.astype("int32"))
        ob.data.update()
        out["split"] = {"name": sp["name"], "faces": int(sel.sum()), "of": int(len(sel))}
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
    out["ref"] = piece["ref"]
    bpy.ops.wm.save_mainfile()
    os.makedirs(os.path.join(OUT, "rounds"), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "rounds", f"{pid}_{tag}.blend"), copy=True)
    json.dump(out, open(os.path.join(rdir, f"{tag}_result.json"), "w"), indent=1, default=str)
    print("@@RESULT@@" + json.dumps(out, default=str))


main()
