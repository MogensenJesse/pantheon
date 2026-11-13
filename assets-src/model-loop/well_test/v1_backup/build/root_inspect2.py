import bpy, json
from mathutils import Vector
out={}
for gname in ("G_roof","G_frame"):
    g=bpy.data.collections[gname]
    for o in g.objects:
        if o.type=="MESH":
            pts=[o.matrix_world@Vector(c) for c in o.bound_box]
            lo=[round(min(p[i] for p in pts),3) for i in range(3)]; hi=[round(max(p[i] for p in pts),3) for i in range(3)]
            key=o.name if not o.name.startswith("shingle") else "shingle*"
            if key=="shingle*" and "shingle*" in out: continue
            out[gname+":"+key]=dict(lo=lo,hi=hi,data=o.data.name,mat=[m.name for m in o.data.materials if m])
        else:
            out[gname+":"+o.name]=dict(empty=o.instance_collection.name if o.instance_collection else None,loc=[round(x,3) for x in o.location],rot=[round(x,3) for x in o.rotation_euler],scale=[round(x,3) for x in o.scale])
for n in ("timber_a","timber_b"):
    o=bpy.data.objects[n]; out[n]=dict(dim=[round(x,4) for x in o.dimensions],mat=[m.name for m in o.data.materials if m],users=o.data.users)
print("@@RESULT@@"+json.dumps(out))
