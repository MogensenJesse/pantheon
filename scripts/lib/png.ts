// scripts/lib/png.ts — a tiny RGB canvas and PNG encoder for headless previews (Node zlib only)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

export type Rgb = readonly [number, number, number];

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
  }

  /** Blend colour (0..1 channels) over a pixel with `alpha`. */
  blend(x: number, y: number, color: Rgb, alpha = 1): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 3;
    for (let c = 0; c < 3; c++) {
      this.data[i + c] = Math.round(
        Math.min(255, Math.max(0, this.data[i + c]! * (1 - alpha) + color[c]! * 255 * alpha)),
      );
    }
  }

  disc(cx: number, cy: number, radius: number, color: Rgb, alpha = 1): void {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= radius * radius) this.blend(cx + dx, cy + dy, color, alpha);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: Rgb, alpha = 1): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= steps; k++) {
      this.blend(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, color, alpha);
    }
  }

  save(path: string): void {
    const raw = Buffer.alloc((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (this.width * 3 + 1)] = 0;
      raw.set(
        this.data.subarray(y * this.width * 3, (y + 1) * this.width * 3),
        y * (this.width * 3 + 1) + 1,
      );
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // RGB
    writeFileSync(
      path,
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', new Uint8Array(0)),
      ]),
    );
  }
}
