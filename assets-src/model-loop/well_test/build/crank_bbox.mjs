// node crank_bbox.mjs image.png  -> silhouette bbox and x-extent per 10% height band (mask: saturation > 0.15)
import sharp from 'sharp';
for (const img of process.argv.slice(2)) {
  const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  const rows = new Array(H).fill(null).map(() => [W, -1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 25 && (mx - mn) / mx > 0.15) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); rows[y][0] = Math.min(rows[y][0], x); rows[y][1] = Math.max(rows[y][1], x); }
  }
  const h = y1 - y0;
  const bands = [];
  for (let k = 0; k < 10; k++) { const ys = y0 + Math.floor(h * k / 10), ye = y0 + Math.floor(h * (k + 1) / 10); let a = W, b = -1; for (let y = ys; y < ye; y++) { a = Math.min(a, rows[y][0]); b = Math.max(b, rows[y][1]); } bands.push(a + '-' + b); }
  console.log(img.split('/').pop(), 'bbox', x0, y0, x1, y1, 'w', x1 - x0, 'h', h, 'ratio', ((x1 - x0) / h).toFixed(3), '\n  bands', bands.join(' '));
}
