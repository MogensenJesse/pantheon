"""Helpers of the temple groups: every piece is a linked duplicate of a frozen part (shared mesh and material), placed with a small seeded jitter.
Rotations are 3x3 matrices composed with @ (rightmost applied first): ry(-40) @ rz(90) turns a part 90 deg about Z, then tilts it about Y."""
import math
import random

import bpy
from mathutils import Matrix


def gcol(g):
    """Empty G_<g> under the scene collection (an older build of the group is cleared first)."""
    c = bpy.data.collections.get("G_" + g)
    if c is None:
        c = bpy.data.collections.new("G_" + g)
        bpy.context.scene.collection.children.link(c)
    for o in list(c.objects):
        bpy.data.objects.remove(o)
    return c


def rx(d):
    return Matrix.Rotation(math.radians(d), 3, "X")


def ry(d):
    return Matrix.Rotation(math.radians(d), 3, "Y")


def rz(d):
    return Matrix.Rotation(math.radians(d), 3, "Z")


def place(g, src, loc=(0.0, 0.0, 0.0), rot=None, scale=(1.0, 1.0, 1.0), name=None):
    """A linked duplicate of part object `src` in G_<g>."""
    ob = bpy.data.objects.new(name or src, bpy.data.objects[src].data)
    ob.location = loc
    ob.rotation_euler = (rot if rot is not None else Matrix.Identity(3)).to_euler()
    ob.scale = scale
    bpy.data.collections["G_" + g].objects.link(ob)
    return ob


def jit(rnd, loc, pos=0.01, ang=1.2, rot=None, hgt=0.02):
    """Small placement jitter (group rule: about 1 cm, 1-1.5 degrees, 2% height). Returns (loc, rot, scale)."""
    x, y, z = loc
    r = (rot if rot is not None else Matrix.Identity(3)) @ rz(rnd.uniform(-ang, ang)) @ rx(rnd.uniform(-ang, ang) * 0.5)
    s = 1.0 + rnd.uniform(-hgt, hgt)
    return (x + rnd.uniform(-pos, pos), y + rnd.uniform(-pos, pos), z + rnd.uniform(-pos, pos) * 0.5), r, (1.0, 1.0, s)


def put(g, rnd, src, loc, rot=None, pos=0.01, ang=1.2, hgt=0.02, name=None):
    """place() with the standard jitter."""
    l, r, s = jit(rnd, loc, pos, ang, rot, hgt)
    return place(g, src, l, r, s, name)


def inst(g, group, loc=(0.0, 0.0, 0.0), rot=None, scale=(1.0, 1.0, 1.0), name=None):
    """A collection instance of the finished group G_<group> inside G_<g> (the groups stay built as they are; only placement changes)."""
    e = bpy.data.objects.new(name or group, None)
    e.instance_type = "COLLECTION"
    e.instance_collection = bpy.data.collections["G_" + group]
    e.location = loc
    e.rotation_euler = (rot if rot is not None else Matrix.Identity(3)).to_euler()
    e.scale = scale
    bpy.data.collections["G_" + g].objects.link(e)
    return e
