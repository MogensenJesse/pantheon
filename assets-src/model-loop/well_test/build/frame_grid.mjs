// node frame_grid.mjs out.png a.png b.png : two 1024 images side by side with a 64 px grid and labels (own check only)
import sharp from 'sharp';
const [out, ...ins] = process.argv.slice(2);
const N = 1024;
let lines = '';
for (let i = 0; i <= N; i += 64) {
  lines += `<line x1="${i}" y1="0" x2="${i}" y2="${N}" stroke="#0af" stroke-width="1"/><line x1="0" y1="${i}" x2="${N}" y2="${i}" stroke="#0af" stroke-width="1"/>`;
  lines += `<text x="${i + 2}" y="12" font-size="12" fill="#06c">${i}</text><text x="2" y="${i + 12}" font-size="12" fill="#06c">${i}</text>`;
}
const svg = Buffer.from(`<svg width="${N}" height="${N}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`);
const layers = [];
for (const [k, p] of ins.entries()) {
  const img = await sharp(p).resize(N, N, { fit: 'contain', background: '#fff' }).composite([{ input: svg }]).png().toBuffer();
  layers.push({ input: img, left: k * N, top: 0 });
}
await sharp({ create: { width: N * ins.length, height: N, channels: 3, background: '#fff' } }).composite(layers).png().toFile(out);
