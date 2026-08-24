// src/map/authoring/decodeExrScanline.ts — uncompressed OpenEXR scanline FLOAT decode (no three.js)

const EXR_MAGIC = 0x01312f76;
const COMPRESSION_NONE = 0;
const PIXEL_FLOAT = 2;

export interface DecodedExrImage {
  width: number;
  height: number;
  /** Luminance (Y) or red. */
  y: Float32Array;
  g?: Float32Array;
  b?: Float32Array;
}

function readCString(bytes: Uint8Array, offset: number): { str: string; next: number } {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end++;
  const str = new TextDecoder('latin1').decode(bytes.subarray(offset, end));
  return { str, next: end + 1 };
}

/**
 * Decode an uncompressed FLOAT scanline OpenEXR (Y or BGR).
 * Used for World Machine / Gaea 2048 height + diffuse exports.
 */
export function decodeExrScanlineFloat(buffer: ArrayBuffer): DecodedExrImage {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  if (bytes.length < 8 || dv.getUint32(0, true) !== EXR_MAGIC) {
    throw new Error('Not an OpenEXR file');
  }

  const attrs = new Map<string, { type: string; value: Uint8Array }>();
  let off = 8;
  while (off < bytes.length) {
    const name = readCString(bytes, off);
    off = name.next;
    if (name.str === '') break;
    const type = readCString(bytes, off);
    off = type.next;
    const size = dv.getInt32(off, true);
    off += 4;
    attrs.set(name.str, { type: type.str, value: bytes.subarray(off, off + size) });
    off += size;
  }

  const compressionAttr = attrs.get('compression');
  if (compressionAttr && compressionAttr.value[0] !== COMPRESSION_NONE) {
    throw new Error('Only uncompressed OpenEXR scanline files are supported');
  }

  const dw = attrs.get('dataWindow');
  if (!dw || dw.value.byteLength < 16) throw new Error('EXR missing dataWindow');
  const dwv = new DataView(dw.value.buffer, dw.value.byteOffset, dw.value.byteLength);
  const xMin = dwv.getInt32(0, true);
  const yMin = dwv.getInt32(4, true);
  const xMax = dwv.getInt32(8, true);
  const yMax = dwv.getInt32(12, true);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  if (width < 1 || height < 1 || width > 8192 || height > 8192) {
    throw new Error(`Unsupported EXR size ${width}×${height}`);
  }

  const chlist = attrs.get('channels');
  if (!chlist) throw new Error('EXR missing channels');
  const channels: { name: string; pixelType: number }[] = [];
  let c = 0;
  const chBytes = chlist.value;
  const chDv = new DataView(chBytes.buffer, chBytes.byteOffset, chBytes.byteLength);
  while (c < chBytes.length) {
    const cn = readCString(chBytes, c);
    c = cn.next;
    if (cn.str === '') break;
    const pixelType = chDv.getInt32(c, true);
    c += 16;
    channels.push({ name: cn.str, pixelType });
  }
  if (channels.length === 0) throw new Error('EXR has no channels');
  for (const ch of channels) {
    if (ch.pixelType !== PIXEL_FLOAT) {
      throw new Error(`Unsupported EXR channel type for ${ch.name} (need FLOAT)`);
    }
  }

  const nLines = height;
  const offsets: number[] = [];
  for (let i = 0; i < nLines; i++) {
    offsets.push(Number(dv.getBigUint64(off, true)));
    off += 8;
  }

  const y = new Float32Array(width * height);
  let g: Float32Array | undefined;
  let b: Float32Array | undefined;
  const names = channels.map((ch) => ch.name);
  const hasRgb = names.includes('R') && names.includes('G') && names.includes('B');
  const hasY = names.includes('Y');
  if (hasRgb) {
    g = new Float32Array(width * height);
    b = new Float32Array(width * height);
  } else if (!hasY) {
    throw new Error(`Unsupported EXR channels: ${names.join(', ')}`);
  }

  const expected = width * 4 * channels.length;
  const channelOffset: Record<string, number> = {};
  channels.forEach((ch, i) => {
    channelOffset[ch.name] = i * width * 4;
  });

  for (let row = 0; row < nLines; row++) {
    let p = offsets[row]!;
    const lineY = dv.getInt32(p, true);
    p += 4;
    const dataSize = dv.getInt32(p, true);
    p += 4;
    if (dataSize !== expected) {
      throw new Error(`Unexpected EXR scanline size at y=${lineY}`);
    }
    const yi = lineY - yMin;
    const dst = yi * width;
    const rowDv = new DataView(buffer);
    if (hasRgb) {
      const rOff = p + (channelOffset.R ?? 0);
      const gOff = p + (channelOffset.G ?? width * 4);
      const bOff = p + (channelOffset.B ?? 0);
      for (let x = 0; x < width; x++) {
        y[dst + x] = rowDv.getFloat32(rOff + x * 4, true);
        g![dst + x] = rowDv.getFloat32(gOff + x * 4, true);
        b![dst + x] = rowDv.getFloat32(bOff + x * 4, true);
      }
    } else {
      const yOff = p + (channelOffset.Y ?? 0);
      for (let x = 0; x < width; x++) {
        y[dst + x] = rowDv.getFloat32(yOff + x * 4, true);
      }
    }
  }

  return { width, height, y, g, b };
}
