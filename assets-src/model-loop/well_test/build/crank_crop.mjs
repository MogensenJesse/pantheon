#!/usr/bin/env node
// Median RGB of rectangles: node crank_crop.mjs image.png name:x0,y0,x1,y1 ...  (pixel coords, background ignored by saturation > 0.2)
import sharp from 'sharp';
const [img, ...regs] = process.argv.slice(2);
const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
for (const r of regs) {
  const [name, box] = r.split(':');
  const [x0, y0, x1, y1] = box.split(',').map(Number);
  const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * info.width + x) * 3;
    const [R, G, B] = [data[i], data[i + 1], data[i + 2]];
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx > 25 && (mx - mn) / mx > 0.12) px.push([R, G, B, R + G + B]);
  }
  px.sort((a, b) => a[3] - b[3]);
  const med = (arr) => [0, 1, 2].map((k) => arr.map((q) => q[k]).sort((a, b) => a - b)[arr.length >> 1]);
  const q = (f) => px.slice(Math.floor(px.length * f[0]), Math.floor(px.length * f[1]));
  console.log(name.padEnd(8), 'n', String(px.length).padEnd(6), 'all', hex(med(px)), 'dark', hex(med(q([0, 0.3]))), 'lit', hex(med(q([0.7, 1]))));
}
