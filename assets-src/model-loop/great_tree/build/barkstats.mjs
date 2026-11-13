// ponytail: throwaway probe — colstats only counts saturated pixels (moss on a grey-brown ref); this one counts the low-saturation bark
import sharp from 'sharp';
for (const p of process.argv.slice(2)) {
  const { data } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = (mx - mn) / (mx || 1);
    if (mx > 30 && s > 0.1 && r > g + 2 && s < 0.6) px.push([r, g, b, (r + g + b) / 3]);
  }
  px.sort((a, b) => a[3] - b[3]);
  const med = (arr) => [0, 1, 2].map((k) => arr.map((q) => q[k]).sort((a, b) => a - b)[arr.length >> 1]);
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  console.log(p.split('/').pop(), 'n', px.length, 'top', hex(med(px.slice(Math.floor(px.length * 0.6)))), 'side', hex(med(px.slice(0, Math.floor(px.length * 0.3)))));
}
