// node rect_mean.mjs x y w h img1.png [img2.png ...] : mean and median sRGB of a rectangle (coords in the FIRST image's pixels; others resized to its size first)
import sharp from 'sharp';
const [x, y, w, h, ...ins] = process.argv.slice(2);
const base = await sharp(ins[0]).metadata();
for (const p of ins) {
  const { data } = await sharp(await sharp(p).resize(base.width, base.height).png().toBuffer()).removeAlpha()
    .extract({ left: +x, top: +y, width: +w, height: +h }).raw().toBuffer({ resolveWithObject: true });
  const n = data.length / 3, mean = [0, 0, 0], ch = [[], [], []];
  for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) { mean[k] += data[i + k] / n; ch[k].push(data[i + k]); }
  const med = ch.map((a) => a.sort((u, v) => u - v)[a.length >> 1]);
  // lit = per-channel median of the brightest 40 % of pixels (by mean channel), for surfaces that are not saturated (stone)
  const px = []; for (let i = 0; i < data.length; i += 3) px.push([data[i], data[i + 1], data[i + 2]]);
  px.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
  const top = px.slice(Math.floor(px.length * 0.6));
  const lit = [0, 1, 2].map((k) => top.map((q) => q[k]).sort((u, v) => u - v)[top.length >> 1]);
  console.log(p.split('/').pop(), 'mean', mean.map(Math.round).join(','), 'median', med.join(','), 'lit', lit.join(','));
}
