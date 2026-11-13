#!/usr/bin/env node
/**
 * assets-src/landmarks/add_rune.mjs — step 2 of the Tree landmark model (see birch_rune_build.py)
 *
 * Adds the bind-rune ribbon to a copy of the shipped birch 1, so the birch's own meshes, textures and vertex
 * colours stay exactly as they are.
 *
 * Usage: node assets-src/landmarks/add_rune.mjs <ribbon.glb>
 * Writes public/models/landmarks/birch_rune.glb (PNG textures; bake it next:
 *   node scripts/assets/bake-play-props.mjs --one public/models/landmarks/birch_rune.glb).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { mergeDocuments, unpartition } from '@gltf-transform/functions';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = join(root, 'public', 'models', 'birch1', 'autumn_birch_web.glb');
const out = join(root, 'public', 'models', 'landmarks', 'birch_rune.glb');

const ribbon = process.argv[2];
if (!ribbon) throw new Error('Usage: node assets-src/landmarks/add_rune.mjs <ribbon.glb>');

const io = new NodeIO();
const doc = await io.read(src);
mergeDocuments(doc, await io.read(ribbon));
const [scene, extra] = doc.getRoot().listScenes();
for (const node of extra.listChildren()) scene.addChild(node);
extra.dispose();
await doc.transform(unpartition()); // a GLB holds one buffer

mkdirSync(dirname(out), { recursive: true });
await io.write(out, doc);
console.log(`wrote ${out}`);
