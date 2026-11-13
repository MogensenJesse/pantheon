import sharp from 'sharp';
const [img, y, x0, x1, step] = process.argv.slice(2);
const { data, info } = await sharp(img).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const out = [];
for (let x = +x0; x <= +x1; x += +step) { const i = (+y * info.width + x) * 3; out.push(x + ':' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')); }
console.log(out.join(' '));
