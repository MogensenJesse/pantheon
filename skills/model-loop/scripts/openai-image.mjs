#!/usr/bin/env node
// One OpenAI image call: generate from a prompt, or edit/derive from input images.
// Usage (run from the project root; key from the environment or the project's .env):
//   node .claude/skills/model-loop/scripts/openai-image.mjs --prompt "..." --out out.png
//        [--image ref.png ...] [--size 1024x1024] [--quality low|medium|high] [--tile] [--model gpt-image-2]
// --image (repeatable) uses /v1/images/edits with those images as input; without it /v1/images/generations.
// --tile makes the result seamless (edge cross-fade) and asserts the wrap matches.
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import sharp from 'sharp';

const args = { image: [], size: '1024x1024', quality: 'medium', model: 'gpt-image-2', tile: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (k === 'tile') args.tile = true;
  else if (k === 'image') args.image.push(argv[++i]);
  else args[k] = argv[++i];
}
if (!args.prompt || !args.out) {
  console.error('need --prompt and --out');
  process.exit(2);
}

if (!process.env.OPENAI_API_KEY) {
  try {
    process.loadEnvFile('.env'); // the project's .env, if there is one
  } catch {}
}
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY missing: set it in the environment or in .env in the current folder');
  process.exit(2);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
let res;
if (args.image.length) {
  const fd = new FormData();
  fd.append('model', args.model);
  fd.append('prompt', args.prompt);
  fd.append('size', args.size);
  fd.append('quality', args.quality);
  for (const p of args.image) {
    const type = MIME[extname(p).toLowerCase()] ?? 'image/png';
    fd.append('image[]', new Blob([readFileSync(p)], { type }), basename(p));
  }
  res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
} else {
  res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: args.model, prompt: args.prompt, size: args.size, quality: args.quality }),
  });
}
const json = await res.json();
if (!res.ok || !json.data?.[0]?.b64_json) {
  console.error(`OpenAI error ${res.status}: ${json.error?.message ?? JSON.stringify(json).slice(0, 400)}`);
  process.exit(1);
}
let img = Buffer.from(json.data[0].b64_json, 'base64');

if (args.tile) img = await makeSeamless(img);
await sharp(img).png().toFile(args.out);
const meta = await sharp(args.out).metadata();
const st = await sharp(args.out).stats();
// mean/stdev per RGB channel: a texture with stdev under ~8 reads as flat colour once rendered
const rgb = st.channels.slice(0, 3);
console.log(JSON.stringify({ out: args.out, width: meta.width, height: meta.height, model: args.model, tile: args.tile,
  mean: rgb.map((c) => Math.round(c.mean)), stdev: rgb.map((c) => Math.round(c.stdev)) }));

// Cross-fade the last F columns/rows into the first ones and drop them, so the
// right edge continues into the left (and bottom into top). Then scale back up.
async function makeSeamless(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const C = 3;
  const fx = Math.floor(w / 4);
  const fy = Math.floor(h / 4);
  const W = w - fx;
  const H = h - fy;
  // horizontal pass: w x h -> W x h
  const a = new Float32Array(W * h * C);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < W; x++) {
      const t = x < fx ? x / fx : 1;
      for (let c = 0; c < C; c++) {
        const keep = data[(y * w + x) * C + c];
        const wrap = x < fx ? data[(y * w + W + x) * C + c] : keep;
        a[(y * W + x) * C + c] = t * keep + (1 - t) * wrap;
      }
    }
  // vertical pass: W x h -> W x H
  const out = Buffer.alloc(W * H * C);
  for (let y = 0; y < H; y++) {
    const t = y < fy ? y / fy : 1;
    for (let x = 0; x < W; x++)
      for (let c = 0; c < C; c++) {
        const keep = a[(y * W + x) * C + c];
        const wrap = y < fy ? a[((H + y) * W + x) * C + c] : keep;
        out[(y * W + x) * C + c] = Math.round(t * keep + (1 - t) * wrap);
      }
  }
  // self-check: the wrapped seam must be no rougher than a normal neighbouring column/row pair
  const px = (x, y, c) => out[(y * W + x) * C + c];
  const colDiff = (x0, x1) => {
    let s = 0;
    for (let y = 0; y < H; y++) for (let c = 0; c < C; c++) s += Math.abs(px(x0, y, c) - px(x1, y, c));
    return s / (H * C);
  };
  const rowDiff = (y0, y1) => {
    let s = 0;
    for (let x = 0; x < W; x++) for (let c = 0; c < C; c++) s += Math.abs(px(x, y0, c) - px(x, y1, c));
    return s / (W * C);
  };
  const seam = Math.max(colDiff(W - 1, 0), rowDiff(H - 1, 0));
  const inner = Math.max(colDiff(W >> 1, (W >> 1) + 1), rowDiff(H >> 1, (H >> 1) + 1));
  if (seam > inner * 2 + 2) throw new Error(`tile seam check failed: seam ${seam.toFixed(1)} vs inner ${inner.toFixed(1)}`);
  return sharp(out, { raw: { width: W, height: H, channels: C } }).resize(w, h).png().toBuffer();
}
