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

export interface LibraryEntry {
  family: string;
  name: string;
  relativePath: string;
  url: string;
  bytes: number;
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
