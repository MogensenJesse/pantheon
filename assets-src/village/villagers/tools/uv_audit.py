# Texture audit of the base model: texel density per face and the faces whose UVs collapse (they only show one
# texel column of the atlas), grouped by part and facing.   blender --background <blend> --python uv_audit.py -- <out_dir>
import json
import math
import sys
from collections import defaultdict

import bmesh
import bpy
import importlib.util

HERE = 'D:/pantheon/assets-src/village/villagers/builder_m'
spec = importlib.util.spec_from_file_location('rb', HERE + '/refine_builder.py')
rb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rb)
out = sys.argv[sys.argv.index('--') + 1]
ob = [o for o in bpy.data.objects if o.name.startswith('Builder_MESH')][0]
img = [i for i in bpy.data.images if i.name.startswith('Builder') and i.size[0] > 0][0]
TW, TH = img.size
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
# part per face: classify on the pristine file's components when the vertex counts allow, else by position
names = None
try:
    parts = rb.classify(rb.components(bm))
    names = {v.index: n.split('.')[0] for n, c in parts.items() for v in c}
except RuntimeError:
    pass


def poly_area(pts):
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                   for i in range(len(pts)))) / 2


def facing(n):
    ax = max(range(3), key=lambda i: abs(n[i]))
    return ['side', 'back' if n[1] > 0 else 'front', 'top' if n[2] > 0 else 'bottom'][ax] if ax != 1 else (
        'back' if n[1] > 0 else 'front')


rows = []
for f in bm.faces:
    uv = [(l[uvl].uv.x * TW, l[uvl].uv.y * TH) for l in f.loops]
    a3 = f.calc_area()
    au = poly_area(uv)
    n = f.normal
    cell = (int(sum(u for u, _ in uv) / len(uv) // (TW / 4)), int(sum(v for _, v in uv) / len(uv) // (TH / 3)))
    part = names[f.verts[0].index] if names else '?'
    rows.append({'part': part, 'facing': facing((n.x, n.y, n.z)), 'area3': a3, 'uv_tex2': au,
                 'tex_per_m': math.sqrt(au / a3) if a3 > 1e-9 else 0, 'cell': cell})
med = sorted(r['tex_per_m'] for r in rows)[len(rows) // 2]
agg = defaultdict(lambda: {'area': 0.0, 'bad_area': 0.0, 'faces': 0, 'bad': 0, 'cells': defaultdict(float)})
for r in rows:
    k = (r['part'], r['facing'])
    a = agg[k]
    a['area'] += r['area3']
    a['faces'] += 1
    a['cells'][str(r['cell'])] += r['area3']
    if r['tex_per_m'] < 0.1 * med:
        a['bad_area'] += r['area3']
        a['bad'] += 1
print('MEDIAN texels/m', round(med))
tot = sum(a['area'] for a in agg.values())
bad = sum(a['bad_area'] for a in agg.values())
print('TOTAL area m2', round(tot, 3), 'collapsed-UV area', round(bad, 3), f'({100 * bad / tot:.0f} %)')
for k, a in sorted(agg.items(), key=lambda kv: -kv[1]['bad_area']):
    if a['bad_area'] > 0:
        cells = ', '.join(f'{c}:{v:.3f}' for c, v in sorted(a['cells'].items(), key=lambda kv: -kv[1])[:3])
        print('BAD', f"{k[0]:8s} {k[1]:7s} faces {a['bad']}/{a['faces']}  area {a['bad_area']:.3f}/{a['area']:.3f} m2  cells {cells}")
json.dump({'median': med}, open(out + '/uv_audit.json', 'w'))
