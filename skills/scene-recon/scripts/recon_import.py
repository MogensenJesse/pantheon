"""Bring a raw Trellis GLB into the run's Blender file as one clean, untextured piece (bpy).

    import recon_import
    stats = recon_import.run(r"<R>/meshes/runestone.glb", "runestone", dims_m=(1.2, 0.6, 3.2), tris=12000)

Trellis output is always about 1 m tall, dense (hundreds of thousands of triangles), and carries one baked
material. Steps, in this order:
  import -> bake parent transforms and join the meshes into one object -> turn by yaw_deg about Z (the piece comes
  out of Trellis at any yaw; orient_fit.run finds the angle that matches the reference) -> merge by distance ->
  drop loose bits (small, separate, far smaller than the main body) -> recalculate normals outward ->
  scale to `dims_m`, origin at bottom-centre (z = 0 at the floor, x/y centred) -> optional cleanup in metres
  (inflate_m: fatten thin strands along their normals; voxel_m: voxel remesh into one closed skin) ->
  decimate to about `tris` ->
  strip the material, its images and any colour attributes (the retexture comes from loop_mat's box projection).
The object is named `name`, with a mesh of the same name, and sits in collection `collection` (default
`P_<name>`, created if missing).

dims_m = (x, y, z) in metres, Blender axes (Z up, front = -Y). fit:
  "fit"    (default) one uniform scale so the piece fits inside the box (never distorts the shape);
  "height" uniform scale so the height matches dims_m[2];
  "axes"   a different scale per axis so the box is filled exactly (distorts; for repeated blocks only).
Returns a stats dict (triangles before/after, loose bits removed, scale, final size).
"""
import math
import os

import bmesh
import bpy
import numpy as np


def _enable_gltf():
    if hasattr(bpy.ops.import_scene, "gltf"):
        return
    import addon_utils

    for mod in ("io_scene_gltf2", "bl_ext.blender_org.io_scene_gltf2"):
        try:
            addon_utils.enable(mod, default_set=False)
        except Exception:
            continue
        if hasattr(bpy.ops.import_scene, "gltf"):
            return
    raise RuntimeError("the glTF importer add-on is not available in this Blender")


def _select(objs, active):
    bpy.context.view_layer.update()  # objects removed with bpy.data.objects.remove leave stale (None) entries until then
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def _tris(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def _coords(me):
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def _join(objs):
    objs = list(objs)
    if len(objs) == 1:
        return objs[0]
    _select(objs, objs[0])
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def run(glb, name, dims_m, tris=12000, fit="fit", merge_frac=5e-4, min_face_frac=0.01, min_diag_frac=0.10,
        collection=None, yaw_deg=0.0, inflate_m=0.0, voxel_m=0.0):
    if not os.path.isfile(glb):
        raise FileNotFoundError(glb)
    if fit not in ("fit", "height", "axes"):
        raise ValueError("fit must be 'fit', 'height' or 'axes'")
    _enable_gltf()
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise ValueError(f"{glb} holds no mesh")

    # bake parent transforms (the importer turns Y-up into Z-up on a parent), then one object
    _select(meshes, meshes[0])
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    obj = _join(meshes)
    me = obj.data
    if yaw_deg:  # Trellis does not put the reference's view at the front: turn it first (orient_fit.run finds the angle)
        from mathutils import Matrix

        me.transform(Matrix.Rotation(math.radians(yaw_deg), 4, "Z"))
        me.update()
    stats = {"name": name, "tris_in": _tris(me), "materials_removed": 0, "yaw_deg": yaw_deg}
    co = _coords(me)
    stats["size_in_m"] = [round(float(v), 4) for v in co.max(0) - co.min(0)]
    diag = float(np.linalg.norm(co.max(0) - co.min(0)))

    # merge by distance, remove loose verts / edges that belong to no face
    bm = bmesh.new()
    bm.from_mesh(me)
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_frac * diag)
    stats["merged_verts"] = n0 - len(bm.verts)
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context="VERTS")
    bm.to_mesh(me)
    bm.free()

    # drop loose bits: separate by connectivity, keep the bodies that are big or substantial
    _select([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [o for o in bpy.context.view_layer.objects if o.select_get() and o.type == "MESH"]
    sizes = []
    for o in parts:
        c = _coords(o.data)
        sizes.append((_tris(o.data), float(np.linalg.norm(c.max(0) - c.min(0)))))
    total_tris = sum(s[0] for s in sizes)
    main_diag = max(s[1] for s in sizes)
    keep, drop = [], []
    for o, (t, d) in zip(parts, sizes):
        small = t < min_face_frac * total_tris and d < min_diag_frac * main_diag
        (drop if small else keep).append(o)
    stats["loose_removed"] = len(drop)
    stats["loose_tris_removed"] = int(sum(s[0] for o, s in zip(parts, sizes) if o in drop))
    for o in drop:
        bpy.data.objects.remove(o)
    obj = _join(keep)
    me = obj.data

    # outward normals
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()

    def to_dims(me):
        """Scale to dims_m by `fit`, origin at the bottom-centre. Returns the scale."""
        co = _coords(me)
        size = co.max(0) - co.min(0)
        dx, dy, dz = (float(v) for v in dims_m)
        if fit == "axes":
            k = np.array([dx / size[0], dy / size[1], dz / size[2]])
        elif fit == "height":
            k = np.full(3, dz / size[2])
        else:
            k = np.full(3, min(dx / size[0], dy / size[1], dz / size[2]))
        co = (co - [(co[:, 0].max() + co[:, 0].min()) / 2, (co[:, 1].max() + co[:, 1].min()) / 2, co[:, 2].min()]) * k
        me.vertices.foreach_set("co", co.ravel())
        me.update()
        return k

    # real size first, so the cleanup knobs below are in metres
    s = to_dims(me)
    obj.location, obj.rotation_euler, obj.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
    if inflate_m:  # fatten thin strands: push every vertex out along its normal (the voxel pass then merges what overlaps)
        co = _coords(me)
        nor = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertex_normals.foreach_get("vector", nor)
        me.vertices.foreach_set("co", (co + nor.reshape(-1, 3) * inflate_m).ravel())
        me.update()
    if voxel_m:  # one closed skin: unions overlapping shells, removes inner faces, thin fins and slits narrower than a voxel
        mod = obj.modifiers.new("recon_voxel", "REMESH")
        mod.mode, mod.voxel_size, mod.adaptivity = "VOXEL", voxel_m, 0.0
        _select([obj], obj)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        me = obj.data
        stats["tris_after_voxel"] = _tris(me)
    if inflate_m or voxel_m:
        s = s * to_dims(me)
    now = _tris(me)
    if now > tris:
        mod = obj.modifiers.new("recon_decimate", "DECIMATE")
        mod.decimate_type, mod.ratio = "COLLAPSE", max(tris / now, 0.001)
        _select([obj], obj)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        me = obj.data
        to_dims(me)  # the collapse moves the bounds a little

    # strip the Trellis material, images and colour attributes
    stats["materials_removed"] = len([m for m in me.materials if m])
    me.materials.clear()
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    for m in [m for m in bpy.data.materials if m.users == 0]:
        bpy.data.materials.remove(m)
    for im in [im for im in bpy.data.images if im.users == 0]:
        bpy.data.images.remove(im)

    # name and place
    obj.name, me.name = name, name
    col = bpy.data.collections.get(collection or f"P_{name}")
    if col is None:
        col = bpy.data.collections.new(collection or f"P_{name}")
        bpy.context.scene.collection.children.link(col)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)

    co = _coords(me)
    stats.update({"tris_out": _tris(me), "scale": [round(float(v), 5) for v in s],
                  "size_m": [round(float(v), 4) for v in co.max(0) - co.min(0)],
                  "z_min": round(float(co[:, 2].min()), 6),
                  "centre_xy": [round(float((co[:, i].max() + co[:, i].min()) / 2), 6) for i in (0, 1)],
                  "collection": col.name})
    return stats
