// assets-src/landmarks/sketchfab_prep.mjs — turn a Sketchfab GLB into a lean game prop GLB
//
// The game's prop material reads the base colour map (and its alpha) only, so this drops the normal, occlusion and
// metal-rough maps, the tangents and the extra UV sets, bakes every node transform into the vertices, scales the model to
// `--height` metres (feet on y = 0, XZ centred), joins the meshes that share a material and shrinks the textures.
//
//   node assets-src/landmarks/sketchfab_prep.mjs <in.glb> <out.glb> --height <m> [--texture 2048]
//   node scripts/assets/bake-play-props.mjs --one <out.glb> [--no-lod]      (KTX2 + LODs, in place)
//
// Sources: ancient_tree.glb (DJMaesen, CC-BY 4.0) and stylized_tree_stump.glb (Aartee, CC-BY 4.0); credits sit next to the
// baked files as license.txt.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  center,
  clearNodeTransform,
  flatten,
  getBounds,
  join,
  prune,
  textureCompress,
  transformMesh,
} from '@gltf-transform/functions';
import sharp from 'sharp';

const [input, output, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(name);
  return i < 0 ? fallback : Number(rest[i + 1]);
};
const height = flag('--height', 0);
const textureSize = flag('--texture', 2048);
if (!input || !output || !(height > 0)) {
  console.error('usage: sketchfab_prep.mjs <in.glb> <out.glb> --height <m> [--texture 2048]');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

for (const material of root.listMaterials()) {
  material.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
  material.setMetallicFactor(0).setRoughnessFactor(1);
}
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    prim.setAttribute('TANGENT', null);
    for (const semantic of prim.listSemantics()) {
      if (/^TEXCOORD_[1-9]$/.test(semantic)) prim.setAttribute(semantic, null);
    }
  }
}

await doc.transform(flatten());
for (const node of root.listNodes()) if (node.getMesh()) clearNodeTransform(node);

const before = getBounds(root.listScenes()[0]);
const scale = height / (before.max[1] - before.min[1]);
const s = [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, s);

await doc.transform(
  join(),
  center({ pivot: 'below' }),
  textureCompress({ encoder: sharp, resize: [textureSize, textureSize] }),
  prune(),
);
await io.write(output, doc);

const b = getBounds(root.listScenes()[0]);
const tris = root
  .listMeshes()
  .flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
console.log(
  JSON.stringify({
    out: output,
    scale,
    size: b.max.map((v, i) => +(v - b.min[i]).toFixed(3)),
    min: b.min.map((v) => +v.toFixed(3)),
    primitives: root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0),
    materials: root.listMaterials().map((m) => m.getName()),
    textures: root.listTextures().map((t) => [t.getMimeType(), t.getSize()]),
    tris,
  }),
);
