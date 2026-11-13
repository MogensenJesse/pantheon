import sharp from 'sharp';
const [p, ...boxes] = process.argv.slice(2);
const { data, info } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
for (const b of boxes) {
  const [x0, y0, x1, y1] = b.split(',').map(Number);
  let s = [0, 0, 0], n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * info.width + x) * 3; s[0] += data[i]; s[1] += data[i+1]; s[2] += data[i+2]; n++; }
  const m = s.map(v => Math.round(v / n));
  console.log(b, m.join(','), '#' + m.map(v => v.toString(16).padStart(2, '0')).join(''));
}
