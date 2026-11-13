// Local (free) contrast stretch of the generated shingle texture: node shingle_tex.mjs <k>. Raw copy stays in shingle_raw.png.
import sharp from 'sharp';
const R = 'assets-src/model-loop/well_test/textures/';
const k = Number(process.argv[2] ?? 1.8);
const st = await sharp(R + 'shingle_raw.png').stats();
const m = st.channels.slice(0, 3).map((c) => c.mean);
await sharp(R + 'shingle_raw.png').removeAlpha().linear([k, k, k], m.map((v) => v * (1 - k))).png().toFile(R + 'shingle.png');
const o = await sharp(R + 'shingle.png').stats();
console.log(JSON.stringify({ k, mean: o.channels.slice(0, 3).map((c) => Math.round(c.mean)), stdev: o.channels.slice(0, 3).map((c) => Math.round(c.stdev)) }));
