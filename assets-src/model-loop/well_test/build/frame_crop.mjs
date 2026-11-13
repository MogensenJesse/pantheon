// node frame_crop.mjs out.png x y w h a.png b.png : same crop of two 1024 images side by side, scaled to 600 px high
import sharp from 'sharp';
const [out, x, y, w, h, ...ins] = process.argv.slice(2);
const H = 600, W = Math.round(H * w / h);
const parts = [];
for (const p of ins) {
  const full = await sharp(p).resize(1024, 1024, { fit: 'contain', background: '#fff' }).png().toBuffer();
  parts.push(await sharp(full).extract({ left: +x, top: +y, width: +w, height: +h }).resize(W, H).png().toBuffer());
}
await sharp({ create: { width: W * ins.length, height: H, channels: 3, background: '#fff' } }).composite(parts.map((input, i) => ({ input, left: i * W, top: 0 }))).png().toFile(out);
