// node root_crop.mjs out.png x y w h scale in1.png [in2.png ...] : same crop (coords in the FIRST image's pixels; others are resized to its size first), side by side, optional 50 px grid
import sharp from 'sharp';
const [out, x, y, w, h, scale, ...ins] = process.argv.slice(2);
const grid = process.env.GRID ? Number(process.env.GRID) : 0;
const base = await sharp(ins[0]).metadata();
const parts = [];
for (const p of ins) {
  let img = sharp(await sharp(p).resize(base.width, base.height).png().toBuffer());
  let buf = await img.extract({ left: +x, top: +y, width: +w, height: +h }).resize(Math.round(w * scale), Math.round(h * scale)).png().toBuffer();
  if (grid) {
    let l = '';
    for (let gx = Math.ceil(x / grid) * grid; gx < +x + +w; gx += grid) l += `<line x1="${(gx - x) * scale}" y1="0" x2="${(gx - x) * scale}" y2="${h * scale}" stroke="#09f" stroke-width="1" opacity="0.6"/><text x="${(gx - x) * scale + 2}" y="12" font-size="12" fill="#06c">${gx}</text>`;
    for (let gy = Math.ceil(y / grid) * grid; gy < +y + +h; gy += grid) l += `<line x1="0" y1="${(gy - y) * scale}" x2="${w * scale}" y2="${(gy - y) * scale}" stroke="#09f" stroke-width="1" opacity="0.6"/><text x="2" y="${(gy - y) * scale + 12}" font-size="12" fill="#06c">${gy}</text>`;
    buf = await sharp(buf).composite([{ input: Buffer.from(`<svg width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" xmlns="http://www.w3.org/2000/svg">${l}</svg>`) }]).png().toBuffer();
  }
  parts.push(buf);
}
const W = Math.round(w * scale), H = Math.round(h * scale);
await sharp({ create: { width: W * ins.length, height: H, channels: 3, background: '#fff' } }).composite(parts.map((input, i) => ({ input, left: i * W, top: 0 }))).png().toFile(out);
console.log(out);
