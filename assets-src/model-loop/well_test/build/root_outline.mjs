// node root_outline.mjs out.png ref.png x y w h scale deck=a.png:ff0 shaft=b.png:0f0 ... : outlines of the half-size alpha silhouettes drawn over the reference crop (own check only; coords in ref pixels)
import sharp from 'sharp';
const [out, ref, x, y, w, h, scale, ...items] = process.argv.slice(2);
const mr = await sharp(ref).metadata();
const base = await sharp(ref).extract({ left: +x, top: +y, width: +w, height: +h }).resize(Math.round(w * scale), Math.round(h * scale)).png().toBuffer();
const layers = [];
for (const it of items) {
  const [file, col] = it.split('=')[1].split(':');
  const { data, info } = await sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const W = mr.width, H = mr.height;
  const full = Buffer.alloc(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) full[j * W + i] = data[Math.floor(j * info.height / H) * info.width + Math.floor(i * info.width / W)];
  const edge = Buffer.alloc(W * H * 4);
  const rgb = [parseInt(col[0], 16) * 17, parseInt(col[1], 16) * 17, parseInt(col[2], 16) * 17];
  const m = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : full[j * W + i] > 128 ? 1 : 0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (m(i, j) && !(m(i - 2, j) && m(i + 2, j) && m(i, j - 2) && m(i, j + 2))) { const o = (j * W + i) * 4; edge[o] = rgb[0]; edge[o + 1] = rgb[1]; edge[o + 2] = rgb[2]; edge[o + 3] = 255; }
  }
  const cr = await sharp(edge, { raw: { width: W, height: H, channels: 4 } }).extract({ left: +x, top: +y, width: +w, height: +h }).resize(Math.round(w * scale), Math.round(h * scale)).png().toBuffer();
  layers.push({ input: cr });
}
await sharp(base).composite(layers).png().toFile(out);
console.log(out);
