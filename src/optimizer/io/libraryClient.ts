// src/optimizer/io/libraryClient.ts — project lod0 catalog + capabilities
export interface OptimizerCapabilities {
  ktx: string | null;
  toktx: string | null;
  encoder: 'ktx' | 'toktx' | null;
  canEncode: boolean;
  canValidateKtx: boolean;
  gltfTransform: boolean;
  validator: boolean;
}

export type LibraryLodLevel = 0 | 1 | 2;

export interface LibraryEntry {
  family: string;
  name: string;
  relativePath: string;
  url: string;
  bytes: number;
  /** Sibling GLB URLs keyed by LOD band (0 always present for library lod0 files). */
  lodUrls: Partial<Record<LibraryLodLevel, string>> & { 0: string };
  lodBytes: Partial<Record<LibraryLodLevel, number>> & { 0: number };
  catalogKeys: string[];
  embeddedLod: boolean;
}

export async function fetchCapabilities(): Promise<OptimizerCapabilities> {
  const res = await fetch('/api/dev/optimizer/capabilities');
  if (!res.ok) throw new Error('Capabilities endpoint unavailable (DEV server only)');
  return (await res.json()) as OptimizerCapabilities;
}

export async function fetchLibrary(): Promise<LibraryEntry[]> {
  const res = await fetch('/api/dev/optimizer/library');
  if (!res.ok) throw new Error('Library endpoint unavailable (DEV server only)');
  const data = (await res.json()) as { entries: LibraryEntry[] };
  return data.entries;
}

export function availableLibraryLods(entry: LibraryEntry): LibraryLodLevel[] {
  const out: LibraryLodLevel[] = [0];
  if (entry.lodUrls[1]) out.push(1);
  if (entry.lodUrls[2]) out.push(2);
  return out;
}

export function libraryLodLabel(entry: LibraryEntry): string {
  const bands = availableLibraryLods(entry);
  if (bands.length <= 1) return entry.embeddedLod ? 'embedded LOD' : 'lod0 only';
  return `lod${bands.join('+')}`;
}
