// node root_blend.mjs out.png x y w h scale a.png b.png : crop of a over b at 50 % (own check only; coords in a's pixels)
import sharp from 'sharp';
const [out, x, y, w, h, scale, a, b] = process.argv.slice(2);
const ma = await sharp(a).metadata();
const crop = async (p) => {
  const full = await sharp(p).resize(ma.width, ma.height).png().toBuffer();
  return sharp(full).extract({ left: +x, top: +y, width: +w, height: +h }).resize(Math.round(w * scale), Math.round(h * scale)).png().toBuffer();
};
const ca = await crop(a), cb = await crop(b);
const half = await sharp(ca).ensureAlpha().composite([{ input: Buffer.from([0, 0, 0, 128]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }]).png().toBuffer();
await sharp(cb).composite([{ input: half }]).png().toFile(out);
console.log(out);
