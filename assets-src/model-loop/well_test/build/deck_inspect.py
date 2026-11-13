import bpy, json
out = {"collections": {c.name: [o.name for o in c.objects] for c in bpy.data.collections},
       "materials": [(m.name, m.users) for m in bpy.data.materials]}
for n in ("plank_a", "plank_b", "plank_c"):
    o = bpy.data.objects[n]
    me = o.data
    zs = [v.co.z for v in me.vertices]
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    out[n] = dict(dims=[round(d, 4) for d in o.dimensions], loc=list(o.location), rot=list(o.rotation_euler), scale=list(o.scale),
                  x=(round(min(xs), 3), round(max(xs), 3)), y=(round(min(ys), 3), round(max(ys), 3)), z=(round(min(zs), 3), round(max(zs), 3)),
                  nv=len(me.vertices), mats=[m.name for m in me.materials], users=me.users)
    # the angled cut corner: which corner has the cut (xmax end, +y)?
    mx = max(xs)
    end = [v.co for v in me.vertices if v.co.x > mx - 0.12 and v.co.z > 0.05]
    out[n]["end_y_at_xmax"] = (round(min(c.y for c in end if c.x > mx - 0.005), 3), round(max(c.y for c in end if c.x > mx - 0.005), 3)) if any(c.x > mx - 0.005 for c in end) else None
print("@@RESULT@@" + json.dumps(out))
