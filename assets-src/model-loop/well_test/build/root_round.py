# exec'd by root_drive.py after the default knobs. Round knobs for the v2 pass (judge r10 top fixes), applied part by part.
CAM.update(az=30.0, lens=50.0)
# v2 placement (judge r10 group fix): ring 1.13x, frame and roof lifted 0.1 m, deck 1.2x (r10 was shaft 1.0, frame z 0.088, roof z 1.58, deck 1.15)
PO = dict(shaft=dict(s=1.13), frame=dict(s=1.0, pos=(0, 0, 0.188)), roof=dict(s=0.78, pos=(0, 0, 1.68)),
          deck=dict(s=1.2, pos=(0.1, -0.15, 0.0), yaw=210.0))
import stone_mat  # noqa: E402

stone_mat.apply()
import shaft  # noqa: E402

# v2b (user): irregular timber variants c..f (part), lighter redder timber material, then the groups below pick them up
import timber  # noqa: E402
import timber_mat  # noqa: E402

for _n in "cdef":
    timber.build("timber_" + _n)
timber_mat.apply()

# v2c (user: stones too even): irregular stone variants d..i (part, stone.py VARIANTS), then the ring is rebuilt from them
import stone  # noqa: E402

for _n in stone.VARIANTS:
    stone.build_variant(_n)

shaft.build()  # G_shaft is rebuilt from the linked stone variants each round (coping scale lives in shaft.P)

# v2 bucket (judge r10): rim sat 0.14 m under the ring top (reference: level with it), bucket 15 % small. The hanging strand is a knob of the
# windlass part (hang 0.45 -> 0.24 m, computed from probe_pos.py: tip must rise 0.176 m world = 0.207 m in part units at win_s 0.85).
import windlass  # noqa: E402

windlass.P["hang"] = 0.24
windlass.build()
import frame  # noqa: E402

frame.P["bucket_s"] = 1.15
frame.build()

# v2 roof (judge r10): flat redder shingles (part knobs in shingle.py), finials as slim crossed planks with longer tails (group knobs).
# G_roof copies are cleared first because shingle.build replaces the shingle meshes they share.
import roof  # noqa: E402
import shingle  # noqa: E402

for _o in list(bpy.data.collections["G_roof"].objects):
    bpy.data.objects.remove(_o)
_mats = shingle.make_materials(bpy.path.relpath(R + "/textures/shingle.png"))
for _v in ("a", "b", "c"):
    _ob = shingle.build("shingle_" + _v, _v)
    _ob.data.materials.clear()
    _ob.data.materials.append(_mats["M_shingle" + ("" if _v == "a" else "_" + _v)])
roof.P.update(barge_cs=(1.15, 0.7), barge_ext=0.46, vw=dict(shingle_a=0.36, shingle_b=0.28, shingle_c=0.36))
roof.build()

# v2 deck (judge r10): duller lighter ochre planks (part material, plank_mat.py), thin flat slabs (group scale, same layout seed)
import deck  # noqa: E402
import plank_mat  # noqa: E402

plank_mat.apply()
deck.P["t_scale"] = 0.65
deck.build()

# v2 crank plate colour (part material, crank_mat.py)
import crank_mat  # noqa: E402

crank_mat.apply()
