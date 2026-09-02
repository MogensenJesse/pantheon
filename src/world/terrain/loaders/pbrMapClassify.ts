// src/world/terrain/loaders/pbrMapClassify.ts — vendor-agnostic PBR map roles from filenames
// Poly Haven, ambientCG, Megascans-style albedo/normal/rough/AO/disp names.

export type PbrMapRole =
  | 'color'
  | 'normalGl'
  | 'normalDx'
  | 'arm'
  | 'orm'
  | 'roughness'
  | 'ao'
  | 'metalness'
  | 'spec'
  | 'displacement';

export const TERRAIN_PBR_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export type TerrainOrmSource =
  | { kind: 'arm'; rel: string }
  | { kind: 'orm'; rel: string }
  | {
      kind: 'separate';
      roughnessRel: string;
      aoRel: string | null;
      metalnessRel: string | null;
    };

export interface ResolvedBiomePbrMaps {
  materialKey: string;
  colorRel: string;
  /** Optional leftover in biome folders — play bake does not emit a normal atlas. */
  normalRel: string | null;
  specRel: string | null;
  displacementRel: string | null;
  orm: TerrainOrmSource;
}

const IGNORE_STEM =
  /(?:^|[-_])(preview|previews|sphere|render|cover|thumb|thumbnail|icon)(?:[-_.]|$)/;

/** First match wins — more specific packed/normal maps before generic color/normal. */
const ROLE_PATTERNS: readonly [PbrMapRole, RegExp][] = [
  ['arm', /(?:^|[-_])arm(?:[-_.]|$)/],
  ['orm', /(?:^|[-_])orm(?:[-_.]|$)/],
  ['normalGl', /nor[_-]?gl|normalgl|normal[_-]?gl|normal[_-]?opengl|opengl/],
  ['normalDx', /nor[_-]?dx|normaldx|normal[_-]?dx|normal[_-]?directx|directx/],
  ['displacement', /displacement|(?:^|[-_])disp(?:[-_.]|$)|(?:^|[-_])height(?:[-_.]|$)|heightmap/],
  ['ao', /ambientocclusion|ambient[_-]?occlusion|(?:^|[-_])ao(?:[-_.]|$)/],
  ['roughness', /roughness|(?:^|[-_])rough(?:[-_.]|$)/],
  ['metalness', /metalness|metallic|(?:^|[-_])metal(?:[-_.]|$)/],
  ['spec', /specular|(?:^|[-_])spec(?:[-_.]|$)/],
  [
    'color',
    /base[_-]?color|basecolor|albedo|diffuse|(?:^|[-_])diff(?:[-_.]|$)|(?:^|[-_])(?:color|col)(?:[-_.]|$)/,
  ],
  ['normalGl', /(?:^|[-_])(?:normal|nor|nrm)(?:[-_.]|$)/],
];

const ROLE_STRIP_RE =
  /[-_]?(?:nor[_-]?gl|normalgl|normal[_-]?gl|normal[_-]?opengl|opengl|nor[_-]?dx|normaldx|normal[_-]?dx|directx|displacement|heightmap|ambientocclusion|ambient[_-]?occlusion|roughness|metalness|metallic|specular|base[_-]?color|basecolor|albedo|diffuse|(?:^|[-_])(?:arm|orm|disp|height|ao|rough|metal|spec|diff|color|col|normal|nor|nrm)(?=[-_]|$))/g;

export function posixRel(rel: string): string {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function fileExt(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i < 0 ? '' : fileName.slice(i).toLowerCase();
}

export function fileStem(rel: string): string {
  const base = posixRel(rel).split('/').pop() ?? rel;
  const i = base.lastIndexOf('.');
  return (i < 0 ? base : base.slice(0, i)).toLowerCase();
}

export function classifyPbrMapFile(rel: string): PbrMapRole | null {
  const stem = fileStem(rel);
  if (!stem || IGNORE_STEM.test(stem)) return null;
  for (const [role, re] of ROLE_PATTERNS) {
    if (re.test(stem)) return role;
  }
  return null;
}

export function parseResK(stem: string): number {
  const match = stem.match(/(?:^|[-_])([1248])k(?:[-_.]|$)/i);
  return match ? Number(match[1]) : 0;
}

export function materialKeyFromStem(stem: string): string {
  let key = stem.toLowerCase();
  key = key.replace(/[-_]?(?:[1248])k(?:-(?:jpg|jpeg|png|exr|webp))?/g, '');
  key = key.replace(/[-_]?(?:jpg|jpeg|png|exr|webp)(?=[-_]|$)/g, '');
  key = key.replace(ROLE_STRIP_RE, '');
  key = key.replace(/[-_]+/g, '_').replace(/^_|_$/g, '');
  return key || 'material';
}

function resRank(resK: number, targetK: number): number {
  if (resK === targetK) return 100;
  if (resK > targetK) return 80 - (resK - targetK);
  if (resK > 0) return 50 - (targetK - resK);
  return 60;
}

function extRank(rel: string): number {
  const ext = fileExt(rel);
  if (ext === '.png') return 2;
  if (ext === '.jpg' || ext === '.jpeg') return 1;
  return 0;
}

interface Candidate {
  rel: string;
  role: PbrMapRole;
  key: string;
  rank: number;
}

function toCandidate(rel: string, role: PbrMapRole): Candidate {
  const stem = fileStem(rel);
  const targetK = role === 'displacement' ? 1 : 2;
  const rank = resRank(parseResK(stem), targetK) * 10 + extRank(rel);
  return { rel: posixRel(rel), role, key: materialKeyFromStem(stem), rank };
}

function pickBest(cands: Candidate[]): string | null {
  if (cands.length === 0) return null;
  let best = cands[0]!;
  for (let i = 1; i < cands.length; i++) {
    const c = cands[i]!;
    if (c.rank > best.rank || (c.rank === best.rank && c.rel.length < best.rel.length)) {
      best = c;
    }
  }
  return best.rel;
}

function groupScore(byRole: Map<PbrMapRole, Candidate[]>): number {
  let n = 0;
  if (byRole.has('color')) n += 3;
  if (byRole.has('normalGl') || byRole.has('normalDx')) n += 2;
  if (byRole.has('arm') || byRole.has('orm') || byRole.has('roughness')) n += 2;
  if (byRole.has('ao')) n += 1;
  if (byRole.has('displacement')) n += 1;
  if (byRole.has('spec')) n += 1;
  return n;
}

function isComplete(byRole: Map<PbrMapRole, Candidate[]>): boolean {
  const hasOrm = byRole.has('arm') || byRole.has('orm') || byRole.has('roughness');
  return byRole.has('color') && hasOrm;
}

function resolveGroup(
  key: string,
  byRole: Map<PbrMapRole, Candidate[]>,
): ResolvedBiomePbrMaps | null {
  const colorRel = pickBest(byRole.get('color') ?? []);
  if (!colorRel) return null;
  const normalRel =
    pickBest(byRole.get('normalGl') ?? []) ?? pickBest(byRole.get('normalDx') ?? []);

  const ormRel = pickBest(byRole.get('orm') ?? []);
  const armRel = pickBest(byRole.get('arm') ?? []);
  const roughnessRel = pickBest(byRole.get('roughness') ?? []);
  let orm: TerrainOrmSource;
  if (ormRel) {
    orm = { kind: 'orm', rel: ormRel };
  } else if (armRel) {
    orm = { kind: 'arm', rel: armRel };
  } else if (roughnessRel) {
    orm = {
      kind: 'separate',
      roughnessRel,
      aoRel: pickBest(byRole.get('ao') ?? []),
      metalnessRel: pickBest(byRole.get('metalness') ?? []),
    };
  } else {
    return null;
  }

  return {
    materialKey: key,
    colorRel,
    normalRel,
    specRel: pickBest(byRole.get('spec') ?? []),
    displacementRel: pickBest(byRole.get('displacement') ?? []),
    orm,
  };
}

/**
 * Pick one coherent PBR set from loose maps (and optional glTF role hints).
 * Filename classification wins over hints when both exist.
 */
export function pickBiomePbrMaps(
  relFiles: readonly string[],
  roleHints?: ReadonlyMap<string, PbrMapRole>,
): ResolvedBiomePbrMaps | null {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const raw of relFiles) {
    const rel = posixRel(raw);
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!TERRAIN_PBR_IMAGE_EXTS.has(fileExt(rel))) continue;
    const role = classifyPbrMapFile(rel) ?? roleHints?.get(rel) ?? null;
    if (!role) continue;
    candidates.push(toCandidate(rel, role));
  }

  const byKey = new Map<string, Map<PbrMapRole, Candidate[]>>();
  for (const c of candidates) {
    let roles = byKey.get(c.key);
    if (!roles) {
      roles = new Map();
      byKey.set(c.key, roles);
    }
    const list = roles.get(c.role) ?? [];
    list.push(c);
    roles.set(c.role, list);
  }

  const complete: { key: string; roles: Map<PbrMapRole, Candidate[]>; score: number }[] = [];
  for (const [key, roles] of byKey) {
    if (!isComplete(roles)) continue;
    complete.push({ key, roles, score: groupScore(roles) });
  }
  complete.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const winner = complete[0];
  return winner ? resolveGroup(winner.key, winner.roles) : null;
}

export function describeResolvedBiomeMaps(maps: ResolvedBiomePbrMaps): string[] {
  const ormLine =
    maps.orm.kind === 'separate'
      ? `rough ${maps.orm.roughnessRel}` +
        (maps.orm.aoRel ? ` + ao ${maps.orm.aoRel}` : ' (ao: none)') +
        (maps.orm.metalnessRel ? ` + metal ${maps.orm.metalnessRel}` : '')
      : `${maps.orm.kind} ${maps.orm.rel}`;
  return [
    `material: ${maps.materialKey}`,
    `color: ${maps.colorRel}`,
    `normal: ${maps.normalRel ?? '(none)'}`,
    `orm: ${ormLine}`,
    `spec: ${maps.specRel ?? '(none)'}`,
    `disp: ${maps.displacementRel ?? '(none)'}`,
  ];
}
