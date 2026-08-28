// src/optimizer/io/zipImport.ts — local ZIP of glTF + sidecars (no network URLs)
import { unzipSync } from 'fflate';
import { MAX_IMPORT_BYTES, MAX_ZIP_ENTRIES } from '../pipeline/limits';

const MAX_ARCHIVE_BYTES = MAX_IMPORT_BYTES;
const MAX_ENTRIES = MAX_ZIP_ENTRIES;

export interface ZipImport {
  files: Map<string, Uint8Array>;
  rootGltf: string | null;
  rootGlb: string | null;
  revoke: () => void;
  urlFor: (relative: string) => string;
}

function normalizeEntry(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '' : path.slice(0, i + 1);
}

export function unzipAssetArchive(buffer: ArrayBuffer): ZipImport {
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`ZIP is larger than ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB`);
  }
  const unzipped = unzipSync(new Uint8Array(buffer), {
    filter: (file) => !file.name.endsWith('/'),
  });
  const names = Object.keys(unzipped);
  if (names.length > MAX_ENTRIES) {
    throw new Error(`ZIP has ${names.length} files (max ${MAX_ENTRIES})`);
  }
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const name of names) {
    const data = unzipped[name];
    total += data.byteLength;
    if (total > MAX_ARCHIVE_BYTES) {
      throw new Error('Uncompressed ZIP exceeds the size cap');
    }
    files.set(normalizeEntry(name), data);
  }
  const gltfs = [...files.keys()].filter((n) => /\.gltf$/i.test(n));
  const glbs = [...files.keys()].filter((n) => /\.glb$/i.test(n));
  const rootGltf = gltfs.sort((a, b) => a.split('/').length - b.split('/').length)[0] ?? null;
  const rootGlb = glbs.sort((a, b) => a.split('/').length - b.split('/').length)[0] ?? null;
  if (!rootGltf && !rootGlb) throw new Error('ZIP does not contain a .gltf or .glb');

  const blobs = new Map<string, string>();
  const base = parentDir(rootGltf ?? rootGlb ?? '');
  const revoke = () => {
    for (const url of blobs.values()) URL.revokeObjectURL(url);
    blobs.clear();
  };
  const urlFor = (relative: string) => {
    const decoded = decodeURIComponent(relative).replace(/\\/g, '/');
    if (/^https?:\/\//i.test(decoded) || decoded.startsWith('//')) {
      throw new Error(`External URL blocked: ${decoded}`);
    }
    const cleaned = decoded.replace(/^(\.\/)+/, '');
    const joined = normalizeEntry(base + cleaned);
    const data = files.get(joined) ?? files.get(cleaned);
    if (!data) throw new Error(`Missing sidecar in ZIP: ${decoded}`);
    const existing = blobs.get(joined);
    if (existing) return existing;
    const mime = joined.endsWith('.gltf')
      ? 'model/gltf+json'
      : joined.endsWith('.bin')
        ? 'application/octet-stream'
        : 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: mime }));
    blobs.set(joined, url);
    return url;
  };

  return { files, rootGltf, rootGlb, revoke, urlFor };
}
