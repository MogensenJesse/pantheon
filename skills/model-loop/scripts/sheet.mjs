#!/usr/bin/env node
// Labelled contact sheet: node sheet.mjs --out sheet.png [--h 384] [--cols 4] label=path.png label2=path2.png ...
import sharp from 'sharp';

const argv = process.argv.slice(2);
const opt = { h: 384, cols: 4 };
const items = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
  else {
    const at = argv[i].indexOf('=');
    items.push(at > 0 ? { label: argv[i].slice(0, at), path: argv[i].slice(at + 1) } : { label: '', path: argv[i] });
  }
}
if (!opt.out || !items.length) {
  console.error('usage: sheet.mjs --out sheet.png [--h 384] [--cols 4] label=img.png ...');
  process.exit(2);
}
const H = Number(opt.h);
const W = H; // square cells, images fit inside
const LABEL = 28;
const cols = Math.min(Number(opt.cols), items.length);
const rows = Math.ceil(items.length / cols);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const layers = [];
for (const [i, it] of items.entries()) {
  const left = (i % cols) * W;
  const top = Math.floor(i / cols) * (H + LABEL);
  layers.push({ input: await sharp(it.path).resize(W, H, { fit: 'contain', background: '#ffffff' }).toBuffer(), left, top: top + LABEL });
  const svg = `<svg width="${W}" height="${LABEL}"><text x="6" y="20" font-family="sans-serif" font-size="18" fill="#222">${esc(it.label)}</text></svg>`;
  layers.push({ input: Buffer.from(svg), left, top });
}
await sharp({ create: { width: cols * W, height: rows * (H + LABEL), channels: 3, background: '#ffffff' } })
  .composite(layers)
  .png()
  .toFile(opt.out);
console.log(JSON.stringify({ out: opt.out, items: items.length }));
