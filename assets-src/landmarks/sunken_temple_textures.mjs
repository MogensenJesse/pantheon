// assets-src/landmarks/sunken_temple_textures.mjs — the temple pack's maps folded into base colour maps the game can read
//
// The game's prop material reads one base colour map (and its alpha) only, so from the pack's PBR maps this writes:
//   stone1.png, stone2.png  base colour times a softened ambient occlusion (about the same brightness as the base)
//   wood.png                base colour as it is
//   leaves.png, grass.png   base colour with the opacity map as alpha (the cutout the game's foliage material reads)
//
//   node assets-src/landmarks/sunken_temple_textures.mjs <pack dir (holds textures/)> [out dir]
//        out dir defaults to assets-src/landmarks/sunken_temple_tex
// The pack: "Temple ruins asset pack" (Environment_Asset_Pack.fbx + textures, unzipped anywhere; see sunken_temple_build.py).
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const pack = resolve(process.argv[2] ?? '');
const out = resolve(process.argv[3] ?? join(here, 'sunken_temple_tex'));
const tex = (name) => join(pack, 'textures', `${name}.png`);
mkdirSync(out, { recursive: true });

const raw = async (file, channels) => {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .toColourspace(channels === 1 ? 'b-w' : 'srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

/** Base colour times lerp(1 - AO_AMOUNT, 1, ao), scaled back to the base's mean brightness. */
async function stone(name, file) {
  const base = await raw(tex(`${name}_Base_color`), 3);
  const ao = await raw(tex(`${name}_Mixed_AO`), 1);
  if (base.w !== ao.w || base.h !== ao.h) throw new Error(`${name}: base and AO differ in size`);
  const AO_AMOUNT = 0.45;
  const result = Buffer.alloc(base.data.length);
  let sumAo = 0;
  for (let i = 0; i < ao.data.length; i++) sumAo += ao.data[i] / 255;
  const mean = 1 - AO_AMOUNT + (AO_AMOUNT * sumAo) / ao.data.length;
  for (let i = 0; i < ao.data.length; i++) {
    const f = (1 - AO_AMOUNT + (AO_AMOUNT * ao.data[i]) / 255) / mean;
    for (let c = 0; c < 3; c++) result[i * 3 + c] = Math.min(255, Math.round(base.data[i * 3 + c] * f));
  }
  await sharp(result, { raw: { width: base.w, height: base.h, channels: 3 } }).png().toFile(join(out, file));
}

/** Base colour with the opacity map (its red channel) as alpha. */
async function cutout(name, file) {
  const base = await raw(tex(`${name}_Base_color`), 3);
  const opacity = await raw(tex(`${name}_Opacity`), 1);
  const result = Buffer.alloc(base.w * base.h * 4);
  for (let i = 0; i < base.w * base.h; i++) {
    result.set(base.data.subarray(i * 3, i * 3 + 3), i * 4);
    result[i * 4 + 3] = opacity.data[i];
  }
  await sharp(result, { raw: { width: base.w, height: base.h, channels: 4 } }).png().toFile(join(out, file));
}

await stone('M_Stone1', 'stone1.png');
await stone('M_Stone2', 'stone2.png');
await sharp(tex('M_Tree_Wood_Base_color')).removeAlpha().png().toFile(join(out, 'wood.png'));
await cutout('M_Leaves', 'leaves.png');
await cutout('M_Grass', 'grass.png');
console.log(`wrote 5 maps to ${out}`);
