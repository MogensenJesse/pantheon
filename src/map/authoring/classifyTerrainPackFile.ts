// src/map/authoring/classifyTerrainPackFile.ts — filename roles for terrain pack import

export type TerrainPackRole = 'height' | 'slope' | 'convex' | 'normal' | 'diffuse' | 'unknown';

const ROLE_PATTERNS: Array<{ role: Exclude<TerrainPackRole, 'unknown'>; re: RegExp }> = [
  { role: 'height', re: /(^|[_.\s-])height([_.\s-]|$)/i },
  { role: 'slope', re: /(^|[_.\s-])slope([_.\s-]|$)/i },
  { role: 'convex', re: /(^|[_.\s-])convex([_.\s-]|$)/i },
  { role: 'normal', re: /(^|[_.\s-])normal([_.\s-]|$)/i },
  { role: 'diffuse', re: /(^|[_.\s-])(diffuse|albedo|color)([_.\s-]|$)/i },
];

export function classifyTerrainPackFile(fileName: string): TerrainPackRole {
  const base = fileName.replace(/^.*[\\/]/, '');
  for (const { role, re } of ROLE_PATTERNS) {
    if (re.test(base)) return role;
  }
  return 'unknown';
}

export function isPngTerrainFile(fileName: string): boolean {
  return /\.png$/i.test(fileName);
}

export function isExrTerrainFile(fileName: string): boolean {
  return /\.exr$/i.test(fileName);
}
