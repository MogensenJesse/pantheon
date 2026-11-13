import bpy, json
r = {"cols": [c.name for c in bpy.data.collections], "mats": [m.name for m in bpy.data.materials], "objs": len(bpy.data.objects),
     "scene_root": [o.name for o in bpy.context.scene.collection.objects], "path": bpy.data.filepath,
     "units": bpy.context.scene.unit_settings.system, "view_layer_children": [(c.name, c.exclude) for c in bpy.context.view_layer.layer_collection.children]}
print("@@RESULT@@" + json.dumps(r))
