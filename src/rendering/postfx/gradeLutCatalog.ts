// src/rendering/postfx/gradeLutCatalog.ts — grade LUT catalog from public/textures/grade/manifest.json

export interface GradeLutEntry {
  /** Stable id, e.g. `Canon/Gems-CLog3`. */
  id: string;
  /** URL under public/, e.g. `/textures/grade/Canon/Gems-CLog3.cube`. */
  path: string;
  /** Subfolder name, e.g. `Canon`. */
  vendor: string;
  /** Filename without extension. */
  name: string;
}

export interface GradeLutManifest {
  luts: GradeLutEntry[];
  vendors: string[];
}

const MANIFEST_URL = import.meta.env.DEV ? '/api/dev/grade-luts' : '/textures/grade/manifest.json';

/** Load scanned `.cube` catalog (refreshed on each dev-server request). */
export async function fetchGradeLutCatalog(): Promise<GradeLutManifest> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) {
    throw new Error(`Failed to load grade LUT manifest (${res.status})`);
  }
  const data = (await res.json()) as GradeLutManifest;
  if (!Array.isArray(data.luts) || !Array.isArray(data.vendors)) {
    throw new Error('Invalid grade LUT manifest shape');
  }
  return data;
}

export function lutsForVendor(manifest: GradeLutManifest, vendor: string): GradeLutEntry[] {
  return manifest.luts.filter((entry) => entry.vendor === vendor);
}

export function findLutByPath(
  manifest: GradeLutManifest,
  lutPath: string | null | undefined,
): GradeLutEntry | undefined {
  if (!lutPath) return undefined;
  return manifest.luts.find((entry) => entry.path === lutPath);
}
