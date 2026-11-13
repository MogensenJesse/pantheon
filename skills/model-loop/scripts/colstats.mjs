#!/usr/bin/env node
// Median colour of the object (saturated pixels) in each image, split into bright (lit tops) and dark (sides).
// Calibrates a material against its reference: node colstats.mjs ref.png render.png ...
import sharp from 'sharp';
for (const p of process.argv.slice(2)) {
  const { data, info } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 40 && (mx - mn) / mx > 0.35) px.push([r, g, b, (r + g + b) / 3]);
  }
  px.sort((a, b) => a[3] - b[3]);
  const med = (arr) => [0, 1, 2].map((k) => arr.map((q) => q[k]).sort((a, b) => a - b)[arr.length >> 1]);
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const top = px.slice(Math.floor(px.length * 0.6)), side = px.slice(0, Math.floor(px.length * 0.3));
  console.log(p.split('/').pop(), 'n', px.length, 'top', hex(med(top)), 'side', hex(med(side)));
}
